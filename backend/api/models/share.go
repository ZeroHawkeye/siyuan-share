package models

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Share 分享记录模型
type Share struct {
	ID string `gorm:"primaryKey;size:64" json:"id"`
	// 组合索引加速 user+doc 查询与分页，并支持按创建时间排序
	UserID          string         `gorm:"size:64;index:idx_user_doc,priority:1;index:idx_user_created,priority:1" json:"userId"`
	DocID           string         `gorm:"size:64;index:idx_user_doc,priority:2" json:"docId"`
	DocTitle        string         `gorm:"size:255" json:"docTitle"`
	Content         string         `gorm:"type:text" json:"content"`
	RequirePassword bool           `gorm:"default:false" json:"requirePassword"`
	PasswordHash    string         `gorm:"size:255" json:"-"` // 不在 JSON 中暴露
	ExpireAt        time.Time      `gorm:"index" json:"expireAt"`
	IsPublic        bool           `gorm:"default:true" json:"isPublic"`
	ViewCount       int            `gorm:"default:0" json:"viewCount"`
	CreatedAt       time.Time      `gorm:"index:idx_user_created,priority:2" json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 指定表名
func (Share) TableName() string {
	return "shares"
}

// IsExpired 检查分享是否过期
func (s *Share) IsExpired() bool {
	return time.Now().After(s.ExpireAt)
}

// FindActiveShareByDoc 查找用户某个文档的最新有效分享（未删除）
func FindActiveShareByDoc(userID, docID string) (*Share, error) {
	var share Share
	err := DB.Where("user_id = ? AND doc_id = ?", userID, docID).
		Order("created_at DESC").
		First(&share).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &share, nil
}

// DeleteSharesByUser 删除用户的全部分享
func DeleteSharesByUser(userID string) (int64, error) {
	res := DB.Where("user_id = ?", userID).Delete(&Share{})
	return res.RowsAffected, res.Error
}
