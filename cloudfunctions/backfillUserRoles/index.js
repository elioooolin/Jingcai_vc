const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const PAGE_SIZE = 100

exports.main = async (event) => {
  const { action = 'preview', overwriteExisting = false } = event || {}

  try {
    const currentUser = await getCurrentUser(event)
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '需要管理员权限'
      }
    }

    const plan = await buildBackfillPlan(Boolean(overwriteExisting))

    if (action === 'preview') {
      return {
        success: true,
        action: 'preview',
        plan
      }
    }

    if (action !== 'apply') {
      return {
        success: false,
        error: 'INVALID_ACTION',
        message: 'action 仅支持 preview 或 apply'
      }
    }

    const result = await applyBackfillPlan(plan)
    return {
      success: true,
      action: 'apply',
      plan,
      result,
      message: '用户 role 回填完成'
    }
  } catch (error) {
    console.error('回填用户 role 失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '回填用户 role 失败'
    }
  }
}

async function getCurrentUser(event = {}) {
  const { sessionToken } = event || {}

  if (sessionToken) {
    const sessionResult = await db.collection('user_sessions').where({
      sessionToken,
      isActive: true
    }).get()

    if (sessionResult.data.length > 0) {
      const session = sessionResult.data[0]
      const isExpired = !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()

      if (!isExpired && session.isRegistered && session.userId) {
        const userDoc = await db.collection('users').doc(session.userId).get()
        if (userDoc.data && userDoc.data.status === 'active') {
          return {
            ...userDoc.data,
            role: getUserRole(userDoc.data),
            openid: session.openid
          }
        }
      }
    }
  }

  const wxContext = cloud.getWXContext()
  if (!wxContext.OPENID) {
    return null
  }

  const authResult = await db.collection('auth').where({
    _openid: wxContext.OPENID
  }).get()

  if (authResult.data.length === 0 || !authResult.data[0].phone) {
    return null
  }

  const userResult = await db.collection('users').where({
    phone: authResult.data[0].phone,
    status: 'active'
  }).get()

  if (userResult.data.length === 0) {
    return null
  }

  const user = userResult.data[0]
  return {
    ...user,
    role: getUserRole(user)
  }
}

function getUserRole(user) {
  if (user.role) return user.role
  if (user.isAdmin === true || user.userType === 'admin') return 'admin'
  if (user.userType === 'staff') return 'staff'
  return 'customer'
}

async function buildBackfillPlan(overwriteExisting) {
  const users = await fetchAllUsers()
  const items = []

  users.forEach(user => {
    const inferredRole = inferRole(user)

    if (!inferredRole) {
      items.push({
        userId: user._id,
        name: user.name || '',
        phone: user.phone || '',
        action: 'skip_unknown',
        reason: '无法推断 role',
        currentRole: user.role || null,
        inferredRole: null
      })
      return
    }

    if (user.role && !overwriteExisting) {
      items.push({
        userId: user._id,
        name: user.name || '',
        phone: user.phone || '',
        action: 'skip_existing',
        reason: '已存在 role',
        currentRole: user.role,
        inferredRole
      })
      return
    }

    items.push({
      userId: user._id,
      name: user.name || '',
      phone: user.phone || '',
      action: user.role ? 'update' : 'set',
      currentRole: user.role || null,
      inferredRole
    })
  })

  return {
    overwriteExisting,
    totalUsers: users.length,
    setCount: items.filter(item => item.action === 'set').length,
    updateCount: items.filter(item => item.action === 'update').length,
    skipExistingCount: items.filter(item => item.action === 'skip_existing').length,
    skipUnknownCount: items.filter(item => item.action === 'skip_unknown').length,
    items
  }
}

async function applyBackfillPlan(plan) {
  const setUsers = []
  const updatedUsers = []
  const skippedUsers = []

  for (const item of plan.items) {
    if (!['set', 'update'].includes(item.action)) {
      skippedUsers.push(item.userId)
      continue
    }

    await db.collection('users').doc(item.userId).update({
      data: {
        role: item.inferredRole,
        updatedAt: new Date()
      }
    })

    if (item.action === 'set') {
      setUsers.push(item.userId)
    } else {
      updatedUsers.push(item.userId)
    }
  }

  return {
    setCount: setUsers.length,
    updateCount: updatedUsers.length,
    skippedCount: skippedUsers.length,
    setUsers,
    updatedUsers,
    skippedUsers
  }
}

function inferRole(user) {
  if (user.role) return user.role
  if (user.isAdmin === true || user.userType === 'admin') return 'admin'
  if (user.userType === 'staff') return 'staff'
  if (user.userType === 'customer' || user.phone) return 'customer'
  return null
}

async function fetchAllUsers() {
  const users = []
  let skip = 0

  while (true) {
    const result = await db.collection('users')
      .skip(skip)
      .limit(PAGE_SIZE)
      .get()

    const page = result.data || []
    users.push(...page)

    if (page.length < PAGE_SIZE) {
      break
    }

    skip += PAGE_SIZE
  }

  return users
}
