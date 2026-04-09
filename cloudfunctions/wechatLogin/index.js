// 微信登录云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
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
        const role = getUserRole(user)
        
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
            openid
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
      // 未登记访客允许进入，只是不能访问客户业务
      return {
        success: true,
        isRegistered: false,
        openid: openid,
        user: {
          name: '微信访客',
          role: 'visitor',
          userType: 'visitor',
          openid
        },
        session: {
          role: 'visitor',
          isRegistered: false,
          openid
        },
        message: '访客登录成功'
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
