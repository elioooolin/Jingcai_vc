const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { store } = event

  try {
    if (!store) {
      return {
        success: false,
        error: 'MISSING_STORE',
        message: '缺少门店参数'
      }
    }

    const currentUser = await getCurrentUser(event)
    if (!currentUser || !['admin', 'staff'].includes(currentUser.role)) {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '无权查看菜品图片状态'
      }
    }

    const menuRecords = await getAllByWhere('daily_menus', { store })
    const supplementRecords = await getAllByWhere('dishes', {
      store,
      category: '高补品'
    })

    const menuDishMap = new Map()
    const menuDishIds = new Set()

    menuRecords.forEach((menuRecord) => {
      const meals = menuRecord.meals || {}
      Object.entries(meals).forEach(([, mealData]) => {
        Object.entries(mealData || {}).forEach(([categoryName, categoryData]) => {
          const dishIds = Array.isArray(categoryData?.dishes) ? categoryData.dishes : []
          dishIds.forEach((dishId) => {
            if (!dishId || menuDishIds.has(dishId)) {
              return
            }
            menuDishIds.add(dishId)
            menuDishMap.set(dishId, mapCategoryLabel(categoryName))
          })
        })
      })
    })

    const menuDishes = await getDishesByIds(Array.from(menuDishIds))
    const allItems = []
    const seenDishNames = new Set()

    menuDishes.forEach((dish) => {
      const name = String(dish.name || '').trim()
      if (!name || seenDishNames.has(name)) {
        return
      }
      seenDishNames.add(name)
      allItems.push({
        id: dish._id,
        name,
        categoryLabel: menuDishMap.get(dish._id) || mapCategoryLabel(dish.category),
        fileID: buildImageFileId(dish)
      })
    })

    supplementRecords.forEach((dish) => {
      const name = String(dish.name || '').trim()
      if (!name || seenDishNames.has(name)) {
        return
      }
      seenDishNames.add(name)
      allItems.push({
        id: dish._id,
        name,
        categoryLabel: '高补品',
        fileID: buildImageFileId(dish)
      })
    })

    const items = allItems.sort(compareImageItems)

    return {
      success: true,
      store,
      items
    }
  } catch (error) {
    console.error('获取门店菜品图片状态失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '获取门店菜品图片状态失败'
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
            role: getUserRole(userDoc.data)
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
    role: getUserRole(userResult.data[0])
  }
}

function getUserRole(user) {
  if (user.role) return user.role
  if (user.isAdmin === true || user.userType === 'admin') return 'admin'
  if (user.userType === 'staff') return 'staff'
  return 'customer'
}

async function getAllByWhere(collectionName, where, pageSize = 100) {
  const results = []
  let skip = 0

  while (true) {
    const result = await db.collection(collectionName)
      .where(where)
      .skip(skip)
      .limit(pageSize)
      .get()

    const currentBatch = result.data || []
    results.push(...currentBatch)

    if (currentBatch.length < pageSize) {
      break
    }

    skip += pageSize
  }

  return results
}

async function getDishesByIds(dishIds) {
  if (!dishIds.length) {
    return []
  }

  const results = []
  const chunkSize = 100

  for (let index = 0; index < dishIds.length; index += chunkSize) {
    const chunk = dishIds.slice(index, index + chunkSize)
    const result = await db.collection('dishes')
      .where({
        _id: _.in(chunk)
      })
      .get()
    results.push(...(result.data || []))
  }

  return results
}

function buildImageFileId(dish) {
  return dish.imageFileId || ''
}

function mapCategoryLabel(category) {
  if (category === '汤品') return '汤品'
  if (category === '高补品') return '高补品'
  return '菜品'
}

function compareImageItems(left, right) {
  const categoryWeight = {
    '菜品': 1,
    '汤品': 2,
    '高补品': 3
  }

  const leftWeight = categoryWeight[left.categoryLabel] || 99
  const rightWeight = categoryWeight[right.categoryLabel] || 99

  if (leftWeight !== rightWeight) {
    return leftWeight - rightWeight
  }

  return left.name.localeCompare(right.name)
}
