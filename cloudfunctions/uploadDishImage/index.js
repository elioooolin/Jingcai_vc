const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event = {}) => {
  const { sessionToken, dishName, store, imageBase64 } = event

  try {
    const currentUser = await getCurrentUser({ sessionToken })
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'ADMIN_REQUIRED',
        message: '需要管理员权限'
      }
    }

    const normalizedDishName = String(dishName || '').trim()
    if (!normalizedDishName || !imageBase64) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少菜品名称或图片数据'
      }
    }

    const base64Data = String(imageBase64).replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    if (!buffer.length) {
      return {
        success: false,
        error: 'INVALID_IMAGE',
        message: '图片数据无效'
      }
    }

    const cloudPath = `dish_pics/${normalizedDishName}.JPG`
    const uploadResult = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })

    await updateDishImageFileId(normalizedDishName, store, uploadResult.fileID)

    return {
      success: true,
      message: '图片上传成功',
      fileID: uploadResult.fileID,
      cloudPath
    }
  } catch (error) {
    console.error('上传菜品图片失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '上传菜品图片失败'
    }
  }
}

async function updateDishImageFileId(dishName, store, fileID) {
  const where = store
    ? { name: dishName, store }
    : { name: dishName }

  const result = await db.collection('dishes').where(where).get()
  const dishes = result.data || []

  if (!dishes.length && store) {
    const fallbackResult = await db.collection('dishes').where({
      name: dishName
    }).get()
    dishes.push(...(fallbackResult.data || []))
  }

  await Promise.all(dishes.map((dish) =>
    db.collection('dishes').doc(dish._id).update({
      data: {
        imageFileId: fileID,
        imageUpdatedAt: new Date()
      }
    })
  ))
}

async function getCurrentUser({ sessionToken } = {}) {
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
  if (user.role) return user.role
  if (user.isAdmin === true || user.userType === 'admin') return 'admin'
  if (user.userType === 'staff') return 'staff'
  return 'customer'
}
