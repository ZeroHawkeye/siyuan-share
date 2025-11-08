package routes

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/ZeroHawkeye/siyuan-share-api/controllers"
	"github.com/ZeroHawkeye/siyuan-share-api/middleware"
	"github.com/ZeroHawkeye/siyuan-share-api/models"
	gz "github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// SetupRouter 设置路由
func SetupRouter(staticFiles *embed.FS) *gin.Engine {
	// 自定义 Engine 以便关闭不必要的中间件或切换 JSON 序列化库
	r := gin.New()
	r.Use(gin.Recovery())
	// 仅在开发时启用默认 Logger，生产可通过 GIN_MODE=release 禁用
	if gin.Mode() != gin.ReleaseMode {
		r.Use(gin.Logger())
	}

	// 禁用自动重定向，避免根路径触发 301
	r.RedirectTrailingSlash = false
	r.RedirectFixedPath = false

	// 使用 CORS 中间件 & 响应压缩
	r.Use(middleware.CORSMiddleware())
	r.Use(gz.Gzip(gz.BestSpeed))
	// 静态文件服务（前端）
	if staticFiles != nil {
		// 获取嵌入的 dist 子文件系统
		distFS, err := fs.Sub(*staticFiles, "dist")
		if err == nil {
			// 处理静态文件和 SPA 路由
			r.NoRoute(func(c *gin.Context) {
				requestPath := c.Request.URL.Path

				// API 路由返回 404
				if strings.HasPrefix(requestPath, "/api") {
					c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "not found"})
					return
				}

				// 清理路径
				cleaned := strings.TrimPrefix(requestPath, "/")
				cleaned = path.Clean(cleaned)
				if cleaned == "." {
					cleaned = ""
				}

				// 禁止目录穿越
				if strings.Contains(cleaned, "..") {
					c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "invalid path"})
					return
				}

				serveFile := func(target string) bool {
					if target == "" {
						target = "index.html"
					}

					data, err := fs.ReadFile(distFS, target)
					if err != nil {
						return false
					}

					ext := strings.ToLower(path.Ext(target))
					contentType := mime.TypeByExtension(ext)
					if contentType == "" {
						contentType = http.DetectContentType(data)
					}
					if contentType == "" {
						contentType = "application/octet-stream"
					}

					if ext == ".html" || target == "index.html" {
						contentType = "text/html; charset=utf-8"
						c.Header("Cache-Control", "no-cache")
					} else {
						c.Header("Cache-Control", "public, max-age=31536000, immutable")
					}

					c.Data(http.StatusOK, contentType, data)
					return true
				}

				// 尝试读取静态资源文件（assets 等）
				if strings.Contains(cleaned, ".") {
					if serveFile(cleaned) {
						return
					}
				}

				// 所有其他路径返回 index.html（SPA 路由）
				serveFile("index.html")
			})
		}
	}
	// API 路由组 - 所有后端 API 都在 /api 前缀下
	api := r.Group("/api")
	{
		// 健康检查（公开）
		api.GET("/health", func(c *gin.Context) {
			var userCount int64
			models.DB.Model(&models.User{}).Count(&userCount)
			c.JSON(http.StatusOK, gin.H{
				"status":    "ok",
				"ts":        time.Now().Unix(),
				"userCount": userCount,
				"ginMode":   os.Getenv("GIN_MODE"),
				"version":   "v1", // 可后续从构建信息注入
			})
		})

		// 注册与登录（无需认证）
		api.POST("/auth/register", controllers.Register)
		api.POST("/auth/login", controllers.Login)

		// 健康检查（需要认证，用于测试 API Token）
		api.GET("/auth/health", middleware.AuthMiddleware(), func(c *gin.Context) {
			userID, _ := c.Get("userID")
			c.JSON(http.StatusOK, gin.H{
				"code": 0,
				"msg":  "success",
				"data": gin.H{
					"status": "ok",
					"userID": userID,
					"ts":     time.Now().Unix(),
				},
			})
		})

		// 需要认证的分享管理接口
		share := api.Group("/share")
		share.Use(middleware.AuthMiddleware())
		{
			share.POST("/create", controllers.CreateShare)
			share.GET("/list", controllers.ListShares)
			share.DELETE("/batch", controllers.DeleteSharesBatch)
			share.DELETE(":id", controllers.DeleteShare)
		}

		user := api.Group("/user")
		user.Use(middleware.AuthMiddleware())
		{
			user.GET("/me", controllers.Me)
		}

		// Token 管理端点（需要认证）
		token := api.Group("/token")
		token.Use(middleware.AuthMiddleware())
		{
			token.GET("/list", controllers.ListTokens)
			token.POST("/create", controllers.CreateToken)
			token.POST("/refresh/:id", controllers.RefreshToken)
			token.POST("/revoke/:id", controllers.RevokeToken)
		}

		// 公开访问的分享查看接口
		api.GET("/s/:id", controllers.GetShare)
	}

	return r
}
