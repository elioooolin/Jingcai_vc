// 绑定手机号云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-1gbzoqv6ad653efc'
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { phone } = event
  
  try {
    console.log('绑定手机号请求:', { openid, phone })
    
    if (!openid || !phone) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: '参数错误'
      }
    }
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!phoneRegex.test(phone)) {
      return {
        success: false,
        error: 'INVALID_PHONE',
        message: '邀请码格式不正确'
      }
    }
    
    // 检查手机号是否已被其他用户绑定
    const existingAuthQuery = await db.collection('auth').where({
      phone: phone
    }).get()
    
    if (existingAuthQuery.data.length > 0) {
      return {
        success: false,
        error: 'PHONE_ALREADY_BOUND',
        message: '该邀请码已被绑定，无法重复使用'
      }
    }
    
    // 检查用户信息是否存在于users表中
    const userQuery = await db.collection('users').where({
      phone: phone
    }).get()
    
    if (userQuery.data.length === 0) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
        message: '邀请码错误，请联系管理员添加您的信息'
      }
    }
    
    const user = userQuery.data[0]
    
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
        message: '您的微信账号已绑定其他邀请码'
      }
    }
    
    // 创建auth记录
    const authRecord = {
      _openid: openid,
      phone: phone,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    await db.collection('auth').add({
      data: authRecord
    })
    
    console.log('手机号绑定成功:', { openid, phone })
    
    // 返回完整的用户信息
    return {
      success: true,
      message: '手机号绑定成功',
      user: {
        _id: user._id,
        openid: openid,
        phone: user.phone,
        name: user.name,
        userType: user.userType,
        isAdmin: user.isAdmin,
        room: user.room,
        checkInDate: user.checkInDate,
        status: user.status
      }
    }
    
  } catch (error) {
    console.error('绑定手机号失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '服务器错误，请稍后重试'
    }
  }
}
