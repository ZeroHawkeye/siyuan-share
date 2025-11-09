import { ExclamationCircleOutlined, EyeOutlined, FileSearchOutlined, HomeOutlined, UpOutlined } from '@ant-design/icons'
import { Anchor, Button, Drawer, Image, Input, Layout, message, Result, Spin, Typography } from 'antd'
import 'github-markdown-css/github-markdown-light.css'
import 'highlight.js/styles/github.css'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useParams } from 'react-router-dom'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { getShare, ShareData } from '../api/share'
import './ShareView.css'

const { Content, Sider } = Layout
const { Title, Text } = Typography

interface TocNode {
  id: string
  text: string
  level: number
  children?: TocNode[]
}

function ShareView() {
  const { shareId } = useParams<{ shareId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [share, setShare] = useState<ShareData | null>(null)
  const [requirePassword, setRequirePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [tocVisible, setTocVisible] = useState(false)
  const [tocTree, setTocTree] = useState<TocNode[]>([])
  const [showBackTop, setShowBackTop] = useState(false)
  const [headerShrink, setHeaderShrink] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const loadShare = async (pwd?: string) => {
    if (!shareId) return

    setLoading(true)
    setError(null)
    setPasswordError('')

    try {
      const response = await getShare(shareId, pwd)
      
      if (response.code === 0 && response.data) {
        setShare(response.data)
        setRequirePassword(false)
      } else {
        setError(response.msg || '加载失败')
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.msg || err.message || '加载失败'
      
      if (errorMsg.includes('Password required')) {
        setRequirePassword(true)
      } else if (errorMsg.includes('Invalid password')) {
        setPasswordError('密码错误')
      } else {
        setError(errorMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  // 从已渲染的 DOM 中提取标题，排除代码块内部的伪标题
  useEffect(() => {
    if (!share?.content) {
      setTocTree([])
      return
    }
    const root = contentRef.current
    if (!root) return

    const headingEls = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[]
    const nodes: TocNode[] = []
    const stack: TocNode[] = []
    const idCount: Record<string, number> = {}

    const slugify = (text: string) => {
      let slug = text.trim().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u4e00-\u9fa5-]/g, '')
      slug = slug.replace(/-+/g, '-')
      if (!slug) slug = 'section'
      if (idCount[slug] !== undefined) {
        idCount[slug] += 1
        slug = `${slug}-${idCount[slug]}`
      } else {
        idCount[slug] = 0
      }
      return slug
    }

    headingEls.forEach(el => {
      // 排除代码块内部标题: 如果祖先存在 PRE 或 CODE（且不是本身就是代码标记）
      if (el.closest('pre, code')) return
      const level = Number(el.tagName.substring(1))
      const text = el.textContent?.trim() || ''
      if (!text) return
      // 如果 rehypeSlug 已生成 id 使用之，否则自生成
      let id = el.id
      if (!id) {
        id = slugify(text)
        el.id = id
      } else {
        // 确保唯一
        if (idCount[id] !== undefined) {
          idCount[id] += 1
          const newId = `${id}-${idCount[id]}`
          el.id = newId
          id = newId
        } else {
          idCount[id] = 0
        }
      }
      const node: TocNode = { id, text, level, children: [] }
      // 构建层次：寻找最近的 level < 当前 level 的父节点
      while (stack.length && stack[stack.length - 1].level >= level) {
        stack.pop()
      }
      if (stack.length === 0) {
        nodes.push(node)
      } else {
        const parent = stack[stack.length - 1]
        parent.children = parent.children || []
        parent.children.push(node)
      }
      stack.push(node)
    })
    setTocTree(nodes)
  }, [share?.content])

  useEffect(() => {
    loadShare()
  }, [shareId])

  // 监听滚动显示回到顶部按钮和标题收缩
  useEffect(() => {
    let ticking = false
    let lastScrollY = 0
    
    const handleScroll = () => {
      const scrollY = window.scrollY
      
      // 添加滞后区间，避免边界抖动
      if (Math.abs(scrollY - lastScrollY) < 5) return
      
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setShowBackTop(scrollY > 300)
          // 使用更大的阈值避免抖动
          setHeaderShrink(scrollY > 100)
          lastScrollY = scrollY
          ticking = false
        })
        ticking = true
      }
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 为代码块添加复制按钮
  useEffect(() => {
    if (!share?.content) return
    const root = contentRef.current
    if (!root) return

    const codeBlocks = root.querySelectorAll('pre')
    codeBlocks.forEach((pre) => {
      // 避免重复添加
      if (pre.querySelector('.copy-code-btn')) return

      const wrapper = document.createElement('div')
      wrapper.className = 'code-block-wrapper'
      pre.parentNode?.insertBefore(wrapper, pre)
      wrapper.appendChild(pre)

      const copyBtn = document.createElement('button')
      copyBtn.className = 'copy-code-btn'
      copyBtn.innerHTML = '<svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor"><path d="M832 64H296c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h496v688c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8V96c0-17.7-14.3-32-32-32zM704 192H192c-17.7 0-32 14.3-32 32v530.7c0 8.5 3.4 16.6 9.4 22.6l173.3 173.3c2.2 2.2 4.7 4 7.4 5.5v1.9h4.2c3.5 1.3 7.2 2 11 2H704c17.7 0 32-14.3 32-32V224c0-17.7-14.3-32-32-32zM350 856.2L263.9 770H350v86.2zM664 888H414V746c0-22.1-17.9-40-40-40H232V264h432v624z"></path></svg>'
      copyBtn.title = '复制代码'
      
      copyBtn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.textContent || ''
        try {
          await navigator.clipboard.writeText(code)
          copyBtn.classList.add('copied')
          copyBtn.innerHTML = '<svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor"><path d="M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a32 32 0 00-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l273.9 347c12.8 16.2 37.4 16.2 50.3 0l488.4-618.9c4.1-5.1.4-12.8-6.3-12.8z"></path></svg>'
          message.success('复制成功')
          setTimeout(() => {
            copyBtn.classList.remove('copied')
            copyBtn.innerHTML = '<svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor"><path d="M832 64H296c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h496v688c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8V96c0-17.7-14.3-32-32-32zM704 192H192c-17.7 0-32 14.3-32 32v530.7c0 8.5 3.4 16.6 9.4 22.6l173.3 173.3c2.2 2.2 4.7 4 7.4 5.5v1.9h4.2c3.5 1.3 7.2 2 11 2H704c17.7 0 32-14.3 32-32V224c0-17.7-14.3-32-32-32zM350 856.2L263.9 770H350v86.2zM664 888H414V746c0-22.1-17.9-40-40-40H232V264h432v624z"></path></svg>'
          }, 2000)
        } catch (err) {
          message.error('复制失败')
        }
      })

      wrapper.appendChild(copyBtn)
    })
  }, [share?.content])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setPasswordError('请输入密码')
      return
    }
    loadShare(password)
  }

  // Anchor items 转换
  const buildAnchorItems = (nodes: TocNode[]): any[] => {
    return nodes.map(n => ({
      key: n.id,
      href: `#${n.id}`,
      title: n.text,
      children: n.children && n.children.length > 0 ? buildAnchorItems(n.children) : undefined
    }))
  }
  const anchorItems = buildAnchorItems(tocTree)

  if (loading) {
    return (
      <div className="share-view-loading">
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  if (requirePassword) {
    return (
      <div className="share-view-password">
        <div className="password-card">
          <Title level={3}>此分享需要密码</Title>
          <form onSubmit={handlePasswordSubmit}>
            <Input.Password
              size="large"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              status={passwordError ? 'error' : ''}
            />
            {passwordError && <Text type="danger">{passwordError}</Text>}
            <Button 
              type="primary" 
              htmlType="submit" 
              size="large" 
              block
              style={{ marginTop: '16px' }}
            >
              查看
            </Button>
          </form>
        </div>
      </div>
    )
  }

  if (error) {
    const isNotFound = error.toLowerCase().includes('not found') || error.includes('不存在')
    
    return (
      <div className="share-view-error">
        <Result
          icon={isNotFound ? <FileSearchOutlined /> : <ExclamationCircleOutlined />}
          status={isNotFound ? '404' : 'error'}
          title={isNotFound ? '分享不存在' : '加载失败'}
          subTitle={
            <div className="error-subtitle">
              <Text type="secondary">
                {isNotFound 
                  ? '抱歉，您访问的分享链接不存在或已过期' 
                  : error}
              </Text>
            </div>
          }
          extra={[
            <Button 
              type="primary" 
              icon={<HomeOutlined />}
              onClick={() => window.location.href = '/'}
              key="home"
            >
              返回首页
            </Button>,
            !isNotFound && (
              <Button 
                key="retry"
                onClick={() => loadShare()}
              >
                重试
              </Button>
            )
          ].filter(Boolean)}
        />
      </div>
    )
  }

  if (!share) {
    return (
      <div className="share-view-error">
        <Result
          icon={<FileSearchOutlined />}
          status="404"
          title="分享不存在"
          subTitle={
            <div className="error-subtitle">
              <Text type="secondary">
                抱歉，您访问的分享链接不存在或已过期
              </Text>
            </div>
          }
          extra={[
            <Button 
              type="primary" 
              icon={<HomeOutlined />}
              onClick={() => window.location.href = '/'}
              key="home"
            >
              返回首页
            </Button>
          ]}
        />
      </div>
    )
  }

  return (
    <div className="share-view">
      <Layout>
        {/* 移动端目录按钮 */}
        {tocTree.length > 0 && (
          <Button
            className="mobile-toc-button"
            type="primary"
            onClick={() => setTocVisible(true)}
          >
            目录
          </Button>
        )}

        {/* 回到顶部按钮 */}
        {showBackTop && (
          <Button
            className="back-to-top-button"
            type="primary"
            shape="circle"
            icon={<UpOutlined />}
            onClick={scrollToTop}
            title="回到顶部"
          />
        )}

        {/* 移动端抽屉目录 */}
        <Drawer
          title="目录"
          placement="left"
          onClose={() => setTocVisible(false)}
          open={tocVisible}
          className="mobile-toc-drawer"
        >
          <Anchor
            affix={false}
            items={anchorItems}
            onClick={() => setTocVisible(false)}
          />
        </Drawer>

        <Layout className="share-layout">
          {/* 桌面端侧边栏目录 */}
          {tocTree.length > 0 && (
            <Sider 
              width={250} 
              className="desktop-toc-sider"
              theme="light"
            >
              <div className="toc-wrapper">
                <Title level={5}>目录</Title>
                <Anchor
                  affix={false}
                  items={anchorItems}
                />
              </div>
            </Sider>
          )}

          <Content className="share-content-wrapper">
            <div className={`share-header ${headerShrink ? 'shrink' : ''}`}>
              <Title level={1}>{share.docTitle}</Title>
              <div className="share-meta">
                <Text type="secondary">
                  <EyeOutlined /> 浏览 {share.viewCount} 次
                </Text>
                <Text type="secondary">
                  创建时间: {new Date(share.createdAt).toLocaleString('zh-CN')}
                </Text>
                <Text type="secondary">
                  过期时间: {new Date(share.expireAt).toLocaleString('zh-CN')}
                </Text>
              </div>
            </div>
            
            <div ref={contentRef} className="markdown-body share-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeSlug]}
                components={{
                  img: ({ src, alt }) => {
                    return (
                      <Image
                        src={src}
                        alt={alt}
                        preview={{
                          mask: '点击预览',
                        }}
                        style={{ maxWidth: '100%', height: 'auto' }}
                      />
                    )
                  }
                }}
              >
                {share.content}
              </ReactMarkdown>
            </div>

            <div className="share-footer">
              <Text type="secondary">由思源笔记分享插件提供支持</Text>
            </div>
          </Content>
        </Layout>
      </Layout>
    </div>
  )
}

export default ShareView
