// 获取用户详细信息云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-1gbzoqv6ad653efc'
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    console.log('获取用户信息请求:', { openid })
    
    if (!openid) {
      return {
        success: false,
        error: 'INVALID_OPENID',
        message: '用户身份验证失败'
      }
    }
    
    // 从auth表获取用户绑定的手机号
    const authQuery = await db.collection('auth').where({
      _openid: openid
    }).get()
    
    if (authQuery.data.length === 0) {
      return {
        success: false,
        error: 'USER_NOT_BOUND',
        message: '用户未绑定手机号'
      }
    }
    
    const authRecord = authQuery.data[0]
    
    // 通过手机号获取用户详细信息
    const userQuery = await db.collection('users').where({
      phone: authRecord.phone
    }).get()
    
    if (userQuery.data.length === 0) {
      return {
        success: false,
        error: 'USER_DATA_NOT_FOUND',
        message: '用户数据不存在'
      }
    }
    
    const user = userQuery.data[0]
    
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
        userType: user.userType,
        isAdmin: user.isAdmin,
        room: user.room,
        store: user.store,
        checkInDate: user.checkInDate,
        expectedCheckOutDate: user.expectedCheckOutDate,
        totalDays: user.totalDays,
        birthday: user.birthday,
        dietPreference: user.dietPreference,
        supplementCount: user.supplementCount,
        status: user.status
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
