// 微信登录云函数
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
    console.log('微信登录请求:', { openid })
    
    if (!openid) {
      return {
        success: false,
        error: 'INVALID_OPENID',
        message: '获取用户身份失败'
      }
    }
    
    // 检查用户是否已经在auth表中存在
    const authQuery = await db.collection('auth').where({
      _openid: openid
    }).get()
    
    if (authQuery.data.length > 0) {
      // 用户已存在auth表中，说明已经绑定过手机号
      const authRecord = authQuery.data[0]
      
      // 通过手机号获取用户详细信息
      const userQuery = await db.collection('users').where({
        phone: authRecord.phone
      }).get()
      
      if (userQuery.data.length > 0) {
        const user = userQuery.data[0]
        
        // 检查用户状态
        if (user.status !== 'active') {
          return {
            success: false,
            error: 'USER_INACTIVE',
            message: '您的账号已被停用，请联系管理员'
          }
        }
        
        return {
          success: true,
          isRegistered: true,
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
      } else {
        // auth表中有记录但users表中没有对应用户信息
        return {
          success: false,
          error: 'USER_DATA_MISSING',
          message: '用户数据异常，请联系管理员'
        }
      }
    } else {
      // 用户不在auth表中，需要进行手机号绑定
      return {
        success: true,
        isRegistered: false,
        openid: openid,
        message: '请绑定手机号完成注册'
      }
    }
    
  } catch (error) {
    console.error('微信登录失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '服务器错误，请稍后重试'
    }
  }
}
