package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"log"

	"github.com/ZeroHawkeye/siyuan-share-api/models"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	username := flag.String("username", "", "用户名")
	email := flag.String("email", "", "邮箱")
	password := flag.String("password", "", "密码（至少6位）")
	tokenName := flag.String("token-name", "", "可选：创建一个同名 API Token")
	flag.Parse()

	if *username == "" || *email == "" || *password == "" {
		log.Fatal("请提供用户名、邮箱与密码：-username <用户名> -email <邮箱> -password <密码>")
	}

	if len(*password) < 6 {
		log.Fatal("密码长度至少6位")
	}

	if err := models.InitDB(); err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}

	// 密码哈希
	hash, err := bcrypt.GenerateFromPassword([]byte(*password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("密码哈希失败: %v", err)
	}

	userID := generateUserID()
	user := &models.User{
		ID:           userID,
		Username:     *username,
		Email:        *email,
		PasswordHash: string(hash),
		IsActive:     true,
	}
	if err := models.DB.Create(user).Error; err != nil {
		log.Fatalf("创建用户失败: %v", err)
	}

	fmt.Println("✅ 用户创建成功！")
	fmt.Println("====================")
	fmt.Printf("用户 ID: %s\n", userID)
	fmt.Printf("用户名: %s\n", *username)
	fmt.Printf("邮箱: %s\n", *email)

	if *tokenName != "" {
		raw := generateAPIToken()
		hash := sha256.Sum256([]byte(raw))
		ut := &models.UserToken{ID: "tok_" + generateShortID(), UserID: userID, Name: *tokenName, TokenHash: hex.EncodeToString(hash[:])}
		if err := models.DB.Create(ut).Error; err != nil {
			log.Fatalf("创建 API Token 失败: %v", err)
		}
		fmt.Printf("初始 API Token（%s）: %s\n", *tokenName, raw)
	}
	fmt.Println("====================")
	fmt.Println("提示：可在 Web 仪表盘中创建/刷新/撤销更多 API Token。")
}

func generateAPIToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func generateUserID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return "user_" + hex.EncodeToString(b)
}

func generateShortID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}
