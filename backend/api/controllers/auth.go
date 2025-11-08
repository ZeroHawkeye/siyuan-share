package controllers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"os"
	"time"

	"github.com/ZeroHawkeye/siyuan-share-api/models"
	"github.com/gin-gonic/gin"
	jwt "github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=100"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6,max=200"`
}

// Register 用户注册
func Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "msg": "Invalid request: " + err.Error()})
		return
	}

	// 查重
	var count int64
	models.DB.Model(&models.User{}).Where("username = ?", req.Username).Or("email = ?", req.Email).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "msg": "Username or email already exists"})
		return
	}

	// 哈希密码
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "msg": "Failed to hash password"})
		return
	}

	user := &models.User{
		ID:           "user_" + randHex(16),
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: string(hash),
		IsActive:     true,
	}

	if err := models.DB.Create(user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "msg": "Failed to create user: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "success"})
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login 用户登录，返回会话 JWT
func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "msg": "Invalid request: " + err.Error()})
		return
	}

	var user models.User
	if err := models.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 1, "msg": "Invalid credentials"})
		return
	}
	if user.PasswordHash == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 1, "msg": "Password not set"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 1, "msg": "Invalid credentials"})
		return
	}

	// 生成 JWT
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		secret = "dev-secret"
	}
	expires := time.Now().Add(24 * time.Hour)
	claims := jwt.MapClaims{
		"sub": user.ID,
		"exp": expires.Unix(),
		"iat": time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := token.SignedString([]byte(secret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "msg": "Failed to sign token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "success", "data": gin.H{
		"token": s,
		"user":  gin.H{"id": user.ID, "username": user.Username, "email": user.Email},
	}})
}

// Me 返回当前认证用户信息
func Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	var user models.User
	if err := models.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "msg": "Failed to load user: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "success", "data": gin.H{
		"id": user.ID, "username": user.Username, "email": user.Email, "isActive": user.IsActive, "createdAt": user.CreatedAt,
	}})
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
