const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: 'cloud1-1gbzoqv6ad653efc'
})

const db = cloud.database()
const SESSION_DURATION_DAYS = 30

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { phoneCode, phone } = event

  try {
    console.log('Plan B 手机号登录请求:', {
      openid,
      hasPhoneCode: !!phoneCode,
      hasPhone: !!phone
    })

    if (!openid || (!phoneCode && !phone)) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: '参数错误'
      }
    }

    const resolvedPhone = phoneCode ? await resolvePhoneFromCode(phoneCode) : phone
    const phoneRegex = /^1[3-9]\d{9}$/

    if (!phoneRegex.test(resolvedPhone)) {
      return {
        success: false,
        error: 'INVALID_PHONE',
        message: '手机号格式不正确'
      }
    }

    const userQuery = await db.collection('users').where({
      phone: resolvedPhone
    }).get()

    if (userQuery.data.length === 0) {
      const session = await createSession({
        openid,
        phone: resolvedPhone,
        role: 'visitor',
        isRegistered: false
      })

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
        },
        message: '访客登录成功'
      }
    }

    const user = userQuery.data[0]
    const role = getUserRole(user)

    if (user.status !== 'active') {
      return {
        success: false,
        error: 'USER_INACTIVE',
        message: '您的账号状态异常，请联系管理员'
      }
    }

    const session = await createSession({
      openid,
      userId: user._id,
      phone: user.phone,
      role,
      isRegistered: true
    })

    await upsertAuthRecord(openid, resolvedPhone)

    return {
      success: true,
      isRegistered: true,
      user: {
        _id: user._id,
        openid,
        phone: user.phone,
        name: user.name,
        role,
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
        role,
        isRegistered: true,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      },
      message: '登录成功'
    }
  } catch (error) {
    console.error('Plan B 手机号登录失败:', error)

    if (error && error.code === 'PHONE_AUTH_FAILED') {
      return {
        success: false,
        error: 'PHONE_AUTH_FAILED',
        message: error.message || '微信手机号授权失败，请稍后重试'
      }
    }

    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '服务器错误，请稍后重试'
    }
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

async function resolvePhoneFromCode(code) {
  try {
    const result = await cloud.openapi.phonenumber.getPhoneNumber({
      code
    })

    const phoneInfo = result && result.phoneInfo ? result.phoneInfo : result
    const resolvedPhone = phoneInfo && (phoneInfo.purePhoneNumber || phoneInfo.phoneNumber)

    if (!resolvedPhone) {
      const error = new Error('未能获取微信授权手机号')
      error.code = 'PHONE_AUTH_FAILED'
      throw error
    }

    return resolvedPhone
  } catch (error) {
    console.error('解析微信手机号失败:', error)
    const wrappedError = new Error('微信手机号授权失败，请重试')
    wrappedError.code = 'PHONE_AUTH_FAILED'
    throw wrappedError
  }
}

async function createSession({ openid, userId, phone, role, isRegistered }) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)
  const sessionToken = crypto.randomBytes(24).toString('hex')

  const session = {
    sessionToken,
    openid,
    userId: userId || null,
    phone,
    role,
    isRegistered,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    expiresAt
  }

  await db.collection('user_sessions').add({
    data: session
  })

  return session
}

async function upsertAuthRecord(openid, phone) {
  const now = new Date()
  const existing = await db.collection('auth').where({
    _openid: openid
  }).get()

  if (existing.data.length > 0) {
    await db.collection('auth').doc(existing.data[0]._id).update({
      data: {
        phone,
        updatedAt: now
      }
    })
    return
  }

  await db.collection('auth').add({
    data: {
      _openid: openid,
      phone,
      createdAt: now,
      updatedAt: now
    }
  })
}
