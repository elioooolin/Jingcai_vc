const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { sessionToken } = event

  try {
    if (!sessionToken) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: '缺少 sessionToken'
      }
    }

    const sessionQuery = await db.collection('user_sessions').where({
      sessionToken,
      isActive: true
    }).get()

    if (sessionQuery.data.length === 0) {
      return {
        success: false,
        error: 'SESSION_NOT_FOUND',
        message: '登录状态已失效，请重新登录'
      }
    }

    const session = sessionQuery.data[0]
    const now = new Date()

    if (!session.expiresAt || new Date(session.expiresAt).getTime() <= now.getTime()) {
      await db.collection('user_sessions').doc(session._id).update({
        data: {
          isActive: false,
          updatedAt: now
        }
      })

      return {
        success: false,
        error: 'SESSION_EXPIRED',
        message: '登录已过期，请重新登录'
      }
    }

    if (!session.isRegistered || session.role === 'visitor' || !session.userId) {
      await touchSession(session._id, now)

      return {
        success: true,
        isRegistered: false,
        user: {
          name: '微信访客',
          role: 'visitor',
          userType: 'visitor'
        },
        session: {
          role: 'visitor',
          isRegistered: false,
          sessionToken: session.sessionToken,
          expiresAt: session.expiresAt
        }
      }
    }

    const userDoc = await db.collection('users').doc(session.userId).get()
    const user = userDoc.data

    if (!user || user.status !== 'active') {
      await db.collection('user_sessions').doc(session._id).update({
        data: {
          isActive: false,
          updatedAt: now
        }
      })

      return {
        success: false,
        error: 'USER_INVALID',
        message: '账号状态异常，请重新登录'
      }
    }

    await touchSession(session._id, now)

    return {
      success: true,
      isRegistered: true,
      user: {
        _id: user._id,
        phone: user.phone,
        name: user.name,
        role: user.role || getUserRole(user),
        userType: user.userType,
        isMock: user.isMock,
        isAdmin: user.isAdmin,
        room: user.room,
        store: user.store,
        totalDays: user.totalDays,
        checkInDate: user.checkInDate,
        status: user.status
      },
      session: {
        role: session.role,
        isRegistered: true,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    }
  } catch (error) {
    console.error('校验 session 失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '服务器错误，请稍后重试'
    }
  }
}

async function touchSession(sessionId, now) {
  await db.collection('user_sessions').doc(sessionId).update({
    data: {
      updatedAt: now
    }
  })
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
