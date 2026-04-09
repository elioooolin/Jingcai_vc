// 绑定手机号云函数
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const SESSION_DURATION_DAYS = 30

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { phone, phoneCode } = event
  
  try {
    console.log('绑定手机号请求:', { openid, hasPhone: !!phone, hasPhoneCode: !!phoneCode })
    
    if (!openid || (!phone && !phoneCode)) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: '参数错误'
      }
    }

    const resolvedPhone = phoneCode ? await resolvePhoneFromCode(phoneCode) : phone
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!phoneRegex.test(resolvedPhone)) {
      return {
        success: false,
        error: 'INVALID_PHONE',
        message: '手机号格式不正确'
      }
    }
    
    // 检查手机号是否已被其他用户绑定
    const existingAuthQuery = await db.collection('auth').where({
      phone: resolvedPhone
    }).get()
    
    if (existingAuthQuery.data.length > 0) {
      return {
        success: false,
        error: 'PHONE_ALREADY_BOUND',
        message: '该手机号已被绑定，无法重复使用'
      }
    }
    
    // 检查用户信息是否存在于users表中
    const userQuery = await db.collection('users').where({
      phone: resolvedPhone
    }).get()
    
    if (userQuery.data.length === 0) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
        message: '该手机号未在系统中登记，请联系管理员'
      }
    }
    
    const user = userQuery.data[0]
    const role = getUserRole(user)
    
    // 检查用户状态
    if (user.status !== 'active') {
      return {
        success: false,
        error: 'USER_INACTIVE',
        message: '您的账号状态异常，请联系管理员'
      }
    }
    
    // 检查当前openid是否已经绑定了其他手机号
    const currentAuthQuery = await db.collection('auth').where({
      _openid: openid
    }).get()
    
    if (currentAuthQuery.data.length > 0) {
      return {
        success: false,
        error: 'OPENID_ALREADY_BOUND',
        message: '您的微信账号已绑定其他手机号'
      }
    }
    
    // 创建auth记录
    const authRecord = {
      _openid: openid,
      phone: resolvedPhone,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    await db.collection('auth').add({
      data: authRecord
    })
    
    console.log('手机号绑定成功:', { openid, phone: resolvedPhone })

    const session = await createSession({
      openid,
      userId: user._id,
      phone: user.phone,
      role,
      isRegistered: true
    })
    
    // 返回完整的用户信息
    return {
      success: true,
      message: '手机号绑定成功',
      user: {
        _id: user._id,
        openid: openid,
        phone: user.phone,
        name: user.name,
        role,
        userType: user.userType,
        isAdmin: user.isAdmin,
        store: user.store,
        totalDays: user.totalDays,
        room: user.room,
        checkInDate: user.checkInDate,
        status: user.status
      },
      session: {
        role,
        isRegistered: true,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    }
    
  } catch (error) {
    console.error('绑定手机号失败:', error)

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
