package main

import (
	"embed"
	"log"
	"os"

	"github.com/ZeroHawkeye/siyuan-share-api/models"
	"github.com/ZeroHawkeye/siyuan-share-api/routes"
	"github.com/gin-gonic/gin"
)

//go:embed dist/*
var staticFiles embed.FS

func main() {
	// 初始化数据库
	if err := models.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 移除引导令牌流程：用户通过注册与个人中心管理 Token

	// 设置 Gin 模式
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 创建路由
	r := routes.SetupRouter(&staticFiles)

	// 启动服务器
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
