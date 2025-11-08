package models

import (
	"time"

	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID           string         `gorm:"primaryKey;size:64" json:"id"`
	Username     string         `gorm:"size:100;uniqueIndex" json:"username"`
	Email        string         `gorm:"size:255;uniqueIndex" json:"email"`
	PasswordHash string         `gorm:"size:255" json:"-"` // 密码哈希
	IsActive     bool           `gorm:"default:true" json:"isActive"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
	Tokens       []UserToken    `json:"-"` // 关联的多 API Token
}

// TableName 指定表名
func (User) TableName() string {
	return "users"
}

// UserToken 用户可管理的 API Token（多令牌支持）
type UserToken struct {
	ID         string         `gorm:"primaryKey;size:64" json:"id"`
	UserID     string         `gorm:"index;size:64" json:"userId"`
	Name       string         `gorm:"size:100" json:"name"`          // 令牌别名，便于区分用途
	TokenHash  string         `gorm:"size:255;uniqueIndex" json:"-"` // 存储哈希，避免明文直接落库
	PlainToken string         `gorm:"-" json:"token,omitempty"`      // 仅创建/刷新时返回，不入库
	Revoked    bool           `gorm:"default:false" json:"revoked"`  // 是否已撤销
	LastUsedAt *time.Time     `json:"lastUsedAt,omitempty"`
	CreatedAt  time.Time      `json:"createdAt"`
	UpdatedAt  time.Time      `json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

func (UserToken) TableName() string { return "user_tokens" }
