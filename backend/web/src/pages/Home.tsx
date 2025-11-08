import { ApiOutlined, DashboardOutlined, LockOutlined, LogoutOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Card, Divider, Form, Input, Space, Tabs, Tag, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import api from '../api'
import './Home.css'

const { Title, Text, Paragraph } = Typography

interface HealthData {
  status: string
  ts: number
  userCount: number
  ginMode: string
  version: string
}

interface ApiResponse<T = any> {
  code: number
  msg: string
  data: T
}

interface LoginResponse { token: string; user: { id: string; username: string; email: string } }

function Home() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('status')
  const [sessionUser, setSessionUser] = useState<{ id: string; username: string; email: string } | null>(null)
  const [loadingAction, setLoadingAction] = useState(false)
  const [loginForm] = Form.useForm()
  const [registerForm] = Form.useForm()

  const loadHealth = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/health') as HealthData
      setHealth(res)
    } catch (e: any) {
      message.error('无法连接后端服务')
    } finally {
      setLoading(false)
    }
  }

  const restoreSession = async () => {
    try {
      const res = await api.get('/api/user/me') as ApiResponse<any>
      if (res.code === 0) {
        setSessionUser(res.data)
        setActiveTab('status')
      }
    } catch {}
  }

  useEffect(() => {
    loadHealth()
    restoreSession()
  }, [])

  const handleRegister = async (values: any) => {
    setLoadingAction(true)
    try {
      const res = await api.post('/api/auth/register', values) as ApiResponse
      if (res.code === 0) {
        message.success('注册成功！请登录')
        registerForm.resetFields()
        setActiveTab('login')
      } else {
        message.error(res.msg || '注册失败')
      }
    } catch (e: any) {
      message.error(e.response?.data?.msg || e.message || '注册失败')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleLogin = async (values: any) => {
    setLoadingAction(true)
    try {
      const res = await api.post('/api/auth/login', values) as ApiResponse<LoginResponse>
      if (res.code === 0) {
        localStorage.setItem('session_token', res.data.token)
        setSessionUser(res.data.user)
        message.success(`欢迎回来，${res.data.user.username}！`)
        loginForm.resetFields()
        setActiveTab('status')
      } else {
        message.error(res.msg || '登录失败')
      }
    } catch (e: any) {
      message.error(e.response?.data?.msg || e.message || '登录失败')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('session_token')
    setSessionUser(null)
    message.info('已退出登录')
  }

  const tabItems = [
    {
      key: 'status',
      label: '服务状态',
      children: (
        <div style={{ padding: '24px 0' }}>
          {loading ? (
            <Text type="secondary">加载中...</Text>
          ) : health ? (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Title level={4} style={{ marginBottom: 16 }}>运行状态</Title>
                <Space size="middle" wrap>
                  <Tag color={health.status === 'ok' ? 'success' : 'error'} style={{ fontSize: 14, padding: '4px 12px' }}>
                    {health.status === 'ok' ? '✓ 正常运行' : '异常'}
                  </Tag>
                  <Tag color="geekblue" style={{ fontSize: 14, padding: '4px 12px' }}>版本: {health.version}</Tag>
                </Space>
              </div>
              <Divider style={{ margin: '16px 0' }} />
              {sessionUser ? (
                <Card size="small" style={{ background: '#f6f8fa', border: 'none' }}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Text strong style={{ fontSize: 15 }}>
                      <UserOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                      已登录：{sessionUser.username}
                    </Text>
                    <Space size="middle">
                      <Button type="primary" icon={<DashboardOutlined />} href="/dashboard">
                        进入仪表盘
                      </Button>
                      <Button icon={<LogoutOutlined />} onClick={handleLogout}>退出登录</Button>
                    </Space>
                  </Space>
                </Card>
              ) : (
                <Card size="small" style={{ background: '#fff7e6', border: '1px solid #ffd666' }}>
                  <Paragraph style={{ margin: 0, color: '#ad6800' }}>
                    未登录。请切换至"登录"或"注册"标签管理分享与 API Token。
                  </Paragraph>
                </Card>
              )}
            </Space>
          ) : (
            <Text type="danger">无法连接到后端服务</Text>
          )}
        </div>
      )
    },
    {
      key: 'login',
      label: '登录',
      children: (
        <div style={{ padding: '24px 0', maxWidth: 400, margin: '0 auto' }}>
          <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>欢迎回来</Title>
          <Form form={loginForm} onFinish={handleLogin} layout="vertical" size="large">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loadingAction} size="large">
                登录
              </Button>
            </Form.Item>
          </Form>
          <Paragraph style={{ textAlign: 'center', marginTop: 16, color: '#8c8c8c' }}>
            还没有账号？<a onClick={() => setActiveTab('register')}>立即注册</a>
          </Paragraph>
        </div>
      )
    },
    {
      key: 'register',
      label: '注册',
      children: (
        <div style={{ padding: '24px 0', maxWidth: 400, margin: '0 auto' }}>
          <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>创建账户</Title>
          <Form form={registerForm} onFinish={handleRegister} layout="vertical" size="large">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '至少3个字符' }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" />
            </Form.Item>
            <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
              <Input prefix={<MailOutlined />} placeholder="邮箱" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少6个字符' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item
              name="password2"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次密码不一致'))
                  }
                })
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loadingAction} size="large">
                注册
              </Button>
            </Form.Item>
          </Form>
          <Paragraph style={{ textAlign: 'center', marginTop: 16, color: '#8c8c8c' }}>
            已有账号？<a onClick={() => setActiveTab('login')}>立即登录</a>
          </Paragraph>
        </div>
      )
    }
  ]

  return (
    <div className="home-container">
      <div className="home-header">
        <Title level={2} style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>
          <ApiOutlined style={{ marginRight: 12, color: '#1890ff' }} />
          思源分享服务
        </Title>
        <Paragraph type="secondary" style={{ margin: '8px 0 0 0', fontSize: 15 }}>
          安全、高效的笔记分享平台
        </Paragraph>
      </div>

      <Card className="home-card" bordered={false}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={sessionUser ? tabItems.filter(item => item.key === 'status') : tabItems} size="large" />
      </Card>

      <Card className="usage-card" bordered={false} style={{ marginTop: 24 }}>
        <Title level={4} style={{ marginBottom: 16 }}>使用说明</Title>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Paragraph style={{ margin: 0 }}>
            <Text strong>访问分享：</Text> <Text code>/s/&lt;shareId&gt;</Text>
          </Paragraph>
          <Paragraph style={{ margin: 0 }}>
            <Text strong>API Token：</Text> 登录后前往仪表盘创建（供思源插件使用）
          </Paragraph>
        </Space>
      </Card>
    </div>
  )
}

export default Home
