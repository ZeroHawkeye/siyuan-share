import { ApiOutlined, CopyOutlined, DeleteOutlined, HomeOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Card, Divider, Form, Input, message, Modal, Space, Table, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import api from '../api'

const { Title, Text, Paragraph } = Typography

interface ApiResp<T = any> { code: number; msg: string; data: T }
interface TokenItem { id: string; name: string; revoked: boolean; createdAt: string; lastUsedAt?: string }

function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [tokens, setTokens] = useState<TokenItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string>('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTokenData, setNewTokenData] = useState<{ name: string; token: string } | null>(null)
  const [form] = Form.useForm()

  const loadAll = async () => {
    setLoading(true)
    try {
      const me = await api.get('/api/user/me') as ApiResp<any>
      if (me.code === 0) setUser(me.data)
      const list = await api.get('/api/token/list') as ApiResp<{ items: TokenItem[] }>
      if (list.code === 0) setTokens(list.data.items || [])
    } catch (e: any) {
      message.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const createToken = async (values: any) => {
    setActionLoading('create')
    try {
      const res = await api.post('/api/token/create', values) as ApiResp<any>
      if (res.code === 0) {
        setNewTokenData({ name: res.data.name, token: res.data.token })
        message.success('Token 创建成功')
        form.resetFields()
        setCreateModalOpen(false)
        loadAll()
      } else {
        message.error(res.msg || '创建失败')
      }
    } catch (e: any) {
      message.error(e.response?.data?.msg || e.message || '创建失败')
    } finally {
      setActionLoading('')
    }
  }

  const refreshToken = async (id: string, name: string) => {
    setActionLoading(id)
    try {
      const res = await api.post(`/api/token/refresh/${id}`, {}) as ApiResp<any>
      if (res.code === 0) {
        setNewTokenData({ name, token: res.data.token })
        message.success('Token 已刷新')
        loadAll()
      } else {
        message.error(res.msg || '刷新失败')
      }
    } catch (e: any) {
      message.error(e.response?.data?.msg || e.message || '刷新失败')
    } finally {
      setActionLoading('')
    }
  }

  const revokeToken = async (id: string) => {
    Modal.confirm({
      title: '确认撤销',
      content: '撤销后此 Token 将立即失效，需要刷新或新建才能继续使用。',
      okText: '确认撤销',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        setActionLoading(id)
        try {
          const res = await api.post(`/api/token/revoke/${id}`, {}) as ApiResp<any>
          if (res.code === 0) {
            message.success('Token 已撤销')
            loadAll()
          } else {
            message.error(res.msg || '撤销失败')
          }
        } catch (e: any) {
          message.error(e.response?.data?.msg || e.message || '撤销失败')
        } finally {
          setActionLoading('')
        }
      }
    })
  }

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    message.success('Token 已复制到剪贴板')
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '状态',
      dataIndex: 'revoked',
      key: 'revoked',
      render: (revoked: boolean) => (
        <Tag color={revoked ? 'default' : 'success'}>
          {revoked ? '已撤销' : '正常'}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time: string) => new Date(time).toLocaleString('zh-CN')
    },
    {
      title: '最近使用',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      render: (time?: string) => time ? new Date(time).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: TokenItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<ReloadOutlined />}
            disabled={record.revoked || actionLoading === record.id}
            loading={actionLoading === record.id}
            onClick={() => refreshToken(record.id, record.name)}
          >
            刷新
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={record.revoked || actionLoading === record.id}
            onClick={() => revokeToken(record.id)}
          >
            撤销
          </Button>
        </Space>
      )
    }
  ]

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <Text type="secondary">加载中...</Text>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 1200, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <Card>
          <Space direction="vertical" size="large">
            <Text type="secondary">未登录或会话失效</Text>
            <Button type="primary" href="/">返回首页</Button>
          </Space>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '60px auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 32 }}>
        <Space size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title level={2} style={{ margin: 0 }}>
            <ApiOutlined style={{ marginRight: 12, color: '#1890ff' }} />
            个人仪表盘
          </Title>
          <Button icon={<HomeOutlined />} href="/">返回首页</Button>
        </Space>
      </div>

      <Card
        title={
          <Space>
            <UserOutlined />
            <span>账户信息</span>
          </Space>
        }
        bordered={false}
        style={{ marginBottom: 24, borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}
      >
        <Space direction="vertical" size="small">
          <Text><Text strong>用户名：</Text>{user.username}</Text>
          <Text><Text strong>邮箱：</Text>{user.email}</Text>
          <Text type="secondary"><Text strong>创建时间：</Text>{new Date(user.createdAt).toLocaleString('zh-CN')}</Text>
        </Space>
      </Card>

      <Card
        title={
          <Space>
            <ApiOutlined />
            <span>API Token 管理</span>
          </Space>
        }
        bordered={false}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            创建新令牌
          </Button>
        }
        style={{ borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}
      >
        <Table
          dataSource={tokens}
          columns={columns}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '暂无令牌' }}
        />
        <Divider />
        <Paragraph type="secondary" style={{ margin: 0 }}>
          <Text strong>使用提示：</Text>在思源笔记插件中配置这里创建的任一 Token 作为 Bearer Token，即可管理分享。
        </Paragraph>
      </Card>

      <Modal
        title="创建新令牌"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false)
          form.resetFields()
        }}
        footer={null}
      >
        <Form form={form} onFinish={createToken} layout="vertical">
          <Form.Item
            name="name"
            label="令牌名称"
            rules={[{ required: true, message: '请输入令牌名称' }]}
          >
            <Input placeholder="例如：思源插件 Token" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={actionLoading === 'create'}>
                创建
              </Button>
              <Button onClick={() => {
                setCreateModalOpen(false)
                form.resetFields()
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Token 已生成"
        open={!!newTokenData}
        onCancel={() => setNewTokenData(null)}
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={() => copyToken(newTokenData!.token)}>
            复制 Token
          </Button>,
          <Button key="close" onClick={() => setNewTokenData(null)}>
            我已保存
          </Button>
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Paragraph>
            <Text strong>名称：</Text>{newTokenData?.name}
          </Paragraph>
          <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
            <Text code style={{ fontSize: 13, wordBreak: 'break-all' }}>
              {newTokenData?.token}
            </Text>
          </div>
          <Paragraph type="danger" style={{ margin: 0 }}>
            <Text strong>重要提示：</Text>此 Token 仅显示一次，请立即复制并妥善保存。关闭后无法再次查看明文。
          </Paragraph>
        </Space>
      </Modal>
    </div>
  )
}

export default Dashboard
