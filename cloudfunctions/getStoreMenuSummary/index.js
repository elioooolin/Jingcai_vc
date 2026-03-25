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
        message: '无权查看门店菜单概况'
      }
    }

    const menuRecords = await getAllByWhere('daily_menus', { store })
    const menuDays = menuRecords
      .map(item => Number(item.day))
      .filter(day => Number.isInteger(day))
      .sort((a, b) => a - b)
    const totalDishCount = await countCurrentMenuDishTotal(store, menuRecords)

    if (menuDays.length === 0) {
      return {
        success: true,
        summary: {
          store,
          menuCount: 0,
          minDay: null,
          maxDay: null,
          totalDishCount,
          updatedAt: null
        }
      }
    }

    const latestMenu = menuRecords
      .slice()
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0]

    return {
      success: true,
      summary: {
        store,
        menuCount: menuDays.length,
        minDay: menuDays[0],
        maxDay: menuDays[menuDays.length - 1],
        totalDishCount,
        updatedAt: latestMenu?.updatedAt || latestMenu?.createdAt || null
      }
    }
  } catch (error) {
    console.error('获取门店菜单概况失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '获取门店菜单概况失败'
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

  const user = userResult.data[0]
  return {
    ...user,
    role: getUserRole(user)
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

async function countCurrentMenuDishTotal(store, menuRecords) {
  const supplementRecords = await getAllByWhere('dishes', {
    store,
    category: '高补品'
  })

  const menuDishIds = new Set()
  menuRecords.forEach((menuRecord) => {
    const meals = menuRecord.meals || {}
    Object.values(meals).forEach((mealData) => {
      Object.values(mealData || {}).forEach((categoryData) => {
        const dishIds = Array.isArray(categoryData?.dishes) ? categoryData.dishes : []
        dishIds.forEach((dishId) => {
          if (dishId) {
            menuDishIds.add(dishId)
          }
        })
      })
    })
  })

  const menuDishes = await getDishesByIds(Array.from(menuDishIds))
  const seenDishNames = new Set()

  menuDishes.forEach((dish) => {
    const name = String(dish.name || '').trim()
    if (name) {
      seenDishNames.add(name)
    }
  })

  supplementRecords.forEach((dish) => {
    const name = String(dish.name || '').trim()
    if (name) {
      seenDishNames.add(name)
    }
  })

  return seenDishNames.size
}

async function getDishesByIds(dishIds) {
  if (!dishIds.length) {
    return []
  }

  const results = []
  const chunkSize = 100

  for (let index = 0; index < dishIds.length; index += chunkSize) {
    const chunk = dishIds.slice(index, index + chunkSize)
    const result = await db.collection('dishes').where({
      _id: _.in(chunk)
    }).get()
    results.push(...(result.data || []))
  }

  return results
}
