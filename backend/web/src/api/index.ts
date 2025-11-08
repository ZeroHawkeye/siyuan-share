import axios from 'axios';

// 生产环境使用相对路径，开发环境使用环境变量指定的完整URL
const api = axios.create({
  baseURL: import.meta.env.DEV ? (import.meta.env.VITE_API_URL || 'http://localhost:8080') : '',
  timeout: 10000,
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 自动附加会话令牌（用于仪表盘/API管理）
    try {
      const token = localStorage.getItem('session_token')
      if (token) {
        config.headers = config.headers || {}
        ;(config.headers as any)['Authorization'] = `Bearer ${token}`
      }
    } catch {}
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    return Promise.reject(error)
  }
)

export default api
