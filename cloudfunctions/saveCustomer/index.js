// 保存客户信息云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-1gbzoqv6ad653efc'
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { customerData, isEdit, customerId } = event
  
  try {
    console.log('保存客户信息请求:', { openid, isEdit, customerId })
    
    // 验证管理员权限
    const adminUser = await getCurrentUser(event)

    if (!adminUser || adminUser.role !== 'admin') {
      return {
        success: false,
        error: 'ADMIN_REQUIRED',
        message: '需要管理员权限'
      }
    }
    
    // 验证必填字段
    const requiredFields = [
      'name', 'phone', 'birthday', 'checkInDate', 
      'totalDays', 'store', 'room', 'supplementCount'
    ]
    
    for (const field of requiredFields) {
      if (!customerData[field] || !customerData[field].toString().trim()) {
        return {
          success: false,
          error: 'MISSING_REQUIRED_FIELD',
          message: `缺少必填字段: ${field}`
        }
      }
    }
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!phoneRegex.test(customerData.phone)) {
      return {
        success: false,
        error: 'INVALID_PHONE',
        message: '手机号格式不正确'
      }
    }
    
    // 检查手机号是否已存在（编辑时排除当前记录）
    const phoneQuery = {
      phone: customerData.phone
    }
    
    if (isEdit && customerId) {
      phoneQuery._id = db.command.neq(customerId)
    }
    
    const existingCustomer = await db.collection('users').where(phoneQuery).get()
    
    if (existingCustomer.data.length > 0) {
      return {
        success: false,
        error: 'PHONE_EXISTS',
        message: '该手机号已被其他客户使用'
      }
    }
    
    // 准备保存的数据
    const saveData = {
      phone: customerData.phone,
      name: customerData.name,
      birthday: customerData.birthday,
      role: 'customer',
      userType: 'customer',
      isAdmin: false,
      status: 'active',
      room: customerData.room,
      checkInDate: customerData.checkInDate,
      totalDays: parseInt(customerData.totalDays),
      store: customerData.store,
      dietPreference: customerData.dietPreference || '',
      supplementCount: parseInt(customerData.supplementCount),
      freeFamilyMealCount: parseInt(customerData.freeFamilyMealCount),
      createdBy: adminUser.name,
      updatedAt: new Date()
    }
    
    let result
    
    if (isEdit && customerId) {
      // 更新客户信息
      result = await db.collection('users').doc(customerId).update({
        data: saveData
      })
      
      console.log('客户信息更新成功:', customerId)
      
      return {
        success: true,
        message: '客户信息更新成功',
        customerId: customerId
      }
    } else {
      // 创建新客户
      saveData.createdAt = new Date()
      result = await db.collection('users').add({
        data: saveData
      })
      
      console.log('新客户创建成功:', result._id)
      
      return {
        success: true,
        message: '客户信息保存成功',
        customerId: result._id
      }
    }
    
  } catch (error) {
    console.error('保存客户信息失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '服务器错误，请稍后重试'
    }
  }
}

async function getCurrentUser(event = {}) {
  const { sessionToken } = event

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
