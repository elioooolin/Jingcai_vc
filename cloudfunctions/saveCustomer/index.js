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
    const adminAuth = await db.collection('auth').where({
      _openid: openid
    }).get()
    
    if (adminAuth.data.length === 0) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: '未授权的操作'
      }
    }
    
    const adminPhone = adminAuth.data[0].phone
    const adminUser = await db.collection('users').where({
      phone: adminPhone,
      isAdmin: true,
      status: 'active'
    }).get()
    
    if (adminUser.data.length === 0) {
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
      userType: 'customer',
      isAdmin: false,
      status: 'active',
      room: customerData.room,
      checkInDate: customerData.checkInDate,
      totalDays: parseInt(customerData.totalDays),
      store: customerData.store,
      dietPreference: customerData.dietPreference || '',
      supplementCount: parseInt(customerData.supplementCount),
      createdBy: adminUser.data[0].name,
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
      
      // 计算预计出院日期
      const checkInDate = new Date(customerData.checkInDate)
      const expectedCheckOutDate = new Date(checkInDate.getTime() + (parseInt(customerData.totalDays) * 24 * 60 * 60 * 1000))
      saveData.expectedCheckOutDate = expectedCheckOutDate
      
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
