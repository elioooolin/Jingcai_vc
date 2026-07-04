// 获取用户详细信息云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { sessionToken } = event
  
  try {
    console.log('获取用户信息请求:', { openid, hasSessionToken: !!sessionToken })

    const user = await getCurrentUser({ db, cloud, sessionToken })

    if (!user) {
      return {
        success: false,
        error: 'USER_NOT_BOUND',
        message: '用户未绑定手机号'
      }
    }
    const role = getUserRole(user)
    
    // 检查用户状态
    if (user.status !== 'active') {
      return {
        success: false,
        error: 'USER_INACTIVE',
        message: '用户账号已被停用'
      }
    }
    
    return {
      success: true,
      user: {
        _id: user._id,
        openid: openid,
        phone: user.phone,
        name: user.name,
        role,
        userType: user.userType,
        isMock: user.isMock,
        isAdmin: user.isAdmin,
        room: user.room,
        store: user.store,
        checkInDate: user.checkInDate,
        totalDays: user.totalDays,
        birthday: user.birthday,
        dietPreference: user.dietPreference,
        supplementCount: user.isMock === true ? Math.max(user.supplementCount || 0, 4) : user.supplementCount,
        status: user.status
      },
      session: {
        role,
        isRegistered: true,
        openid: user.openid || openid
      }
    }
    
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '服务器错误'
    }
  }
}

async function getCurrentUser({ db, cloud, sessionToken }) {
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

  return {
    ...userResult.data[0],
    role: getUserRole(userResult.data[0]),
    openid: wxContext.OPENID
  }
}

function getUserRole(user) {
  if (user.role) {
    return user.role
  }

  if (user.isAdmin === true || user.userType === 'admin') {
    return 'admin'
  }

  if (user.userType === 'staff') {
    return 'staff'
  }

  return 'customer'
}
