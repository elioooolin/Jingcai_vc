const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event = {}) => {
  const { sessionToken, dishId, dishName, categoryLabel, store, imageBase64, fileID } = event

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
    if (!normalizedDishName || (!imageBase64 && !fileID)) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少菜品名称或图片数据'
      }
    }

    let resolvedFileID = String(fileID || '').trim()
    let cloudPath = ''

    if (!resolvedFileID) {
      const base64Data = String(imageBase64).replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')

      if (!buffer.length) {
        return {
          success: false,
          error: 'INVALID_IMAGE',
          message: '图片数据无效'
        }
      }

      cloudPath = buildDishImageCloudPath(normalizedDishName)
      const uploadResult = await cloud.uploadFile({
        cloudPath,
        fileContent: buffer
      })
      resolvedFileID = uploadResult.fileID
    }

    await updateDishImageFileId({
      dishId: String(dishId || '').trim(),
      dishName: normalizedDishName,
      categoryLabel: String(categoryLabel || '').trim(),
      store,
      fileID: resolvedFileID
    })

    return {
      success: true,
      message: '图片上传成功',
      fileID: resolvedFileID,
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

async function updateDishImageFileId({ dishId, dishName, categoryLabel, store, fileID }) {
  if (dishId) {
    const targetResult = await db.collection('dishes').doc(dishId).get()
    const targetDish = targetResult.data

    if (targetDish) {
      if (store && targetDish.store && targetDish.store !== store) {
        throw new Error('选中的菜品不属于当前门店')
      }

      if (dishName && String(targetDish.name || '').trim() !== dishName) {
        throw new Error('选中的菜品与上传菜名不一致')
      }

      await db.collection('dishes').doc(dishId).update({
        data: {
          imageFileId: fileID,
          imageUpdatedAt: new Date()
        }
      })
      return
    }
  }

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

  const normalizedCategory = normalizeCategoryLabel(categoryLabel)
  const matchedDishes = normalizedCategory
    ? dishes.filter((dish) => normalizeCategoryLabel(dish.category) === normalizedCategory)
    : dishes
  const targetDishes = matchedDishes.length ? matchedDishes : dishes

  await Promise.all(targetDishes.map((dish) =>
    db.collection('dishes').doc(dish._id).update({
      data: {
        imageFileId: fileID,
        imageUpdatedAt: new Date()
      }
    })
  ))
}

function normalizeCategoryLabel(category) {
  const value = String(category || '').trim()
  if (!value) return ''
  if (value === '汤品') return '汤品'
  if (value === '高补品') return '高补品'
  return '菜品'
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

function buildDishImageCloudPath(dishName) {
  return `dish_pics/${sanitizeDishImageFileName(dishName)}.JPG`
}

function sanitizeDishImageFileName(dishName) {
  return String(dishName || '')
    .trim()
    .replace(/[+]/g, '＋')
    .replace(/[\\/:*?"<>|#%&=]/g, '_')
}
