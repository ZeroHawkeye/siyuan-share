package models

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// InitDB 初始化数据库连接
func InitDB() error {
	// 确保数据目录存在
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return err
	}

	dbPath := filepath.Join(dataDir, "siyuan-share.db")
	log.Printf("Database path: %s", dbPath)

	// 配置 GORM 日志级别 (SQLITE_LOG_MODE=info|warn|silent)
	logMode := strings.ToLower(os.Getenv("SQLITE_LOG_MODE"))
	var gormLogger logger.Interface = logger.Default.LogMode(logger.Warn)
	switch logMode {
	case "info":
		gormLogger = logger.Default.LogMode(logger.Info)
	case "silent":
		gormLogger = logger.Default.LogMode(logger.Silent)
	case "warn":
		fallthrough
	default:
		gormLogger = logger.Default.LogMode(logger.Warn)
	}
	config := &gorm.Config{Logger: gormLogger}

	// 使用 glebarez/sqlite 驱动连接数据库
	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath), config)
	if err != nil {
		return err
	}

	// 自动迁移数据库表结构
	if err := autoMigrate(); err != nil {
		return err
	}

	// 性能优化 PRAGMA 设置（SQLite）
	applySQLiteOptimizations()

	log.Println("Database initialized successfully")
	return nil
}

// autoMigrate 自动迁移所有模型
func autoMigrate() error {
	return DB.AutoMigrate(
		&Share{},
		&User{},
		&UserToken{},
		&BootstrapToken{}, // 兼容旧数据，后续可移除
	)
}

// applySQLiteOptimizations 设置 SQLite 性能相关 PRAGMA
func applySQLiteOptimizations() {
	if DB == nil {
		return
	}
	// 仅在本地或单实例下开启 WAL 等优化
	pragmas := []string{
		"PRAGMA journal_mode=WAL;",
		"PRAGMA synchronous=NORMAL;",
		"PRAGMA temp_store=MEMORY;",
		"PRAGMA cache_size=-20000;", // 约 20MB page cache
		"PRAGMA wal_autocheckpoint=2000;",
	}
	for _, p := range pragmas {
		if err := DB.Exec(p).Error; err != nil {
			log.Printf("SQLite PRAGMA failed (%s): %v", p, err)
		}
	}
}
