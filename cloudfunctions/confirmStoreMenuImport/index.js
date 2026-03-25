const cloud = require('wx-server-sdk')
const XLSX = require('xlsx')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const PAGE_SIZE = 100

const MEAL_TYPE_MAP = {
  早餐: 'breakfast',
  午餐: 'lunch',
  晚餐: 'dinner',
  高补品: 'supplement'
}

const MENU_RULES = {
  '早餐|菜品': { selection_rule: '任选1项', required_count: 1 },
  '午餐|菜品': { selection_rule: '任选2项', required_count: 2 },
  '午餐|汤品': { selection_rule: '任选1项', required_count: 1 },
  '晚餐|菜品': { selection_rule: '任选2项', required_count: 2 },
  '晚餐|汤品': { selection_rule: '任选1项', required_count: 1 },
  '高补品|高补品': { selection_rule: '最多可选1项', required_count: 0 }
}

exports.main = async (event) => {
  const { store, fileID } = event

  try {
    if (!store || !fileID) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少门店或文件参数'
      }
    }

    const currentUser = await getCurrentUser(event)
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '需要管理员权限'
      }
    }

    const parsed = await parseExcelFile(fileID, store)
    if (parsed.errors.length > 0) {
      return {
        success: false,
        error: 'INVALID_EXCEL',
        message: 'Excel 校验失败，请先修复错误后再导入',
        errors: parsed.errors,
        warnings: parsed.warnings
      }
    }

    await clearStoreMenuData(store)
    const importResult = await importParsedData(parsed, store)

    return {
      success: true,
      message: '门店餐单导入成功',
      result: {
        store,
        dishCount: importResult.dishCount,
        menuDayCount: importResult.menuDayCount,
        supplementDishCount: parsed.supplementDishCount,
        warnings: parsed.warnings
      }
    }
  } catch (error) {
    console.error('确认导入门店餐单失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '确认导入门店餐单失败'
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

async function parseExcelFile(fileID, store) {
  const downloadResult = await cloud.downloadFile({
    fileID
  })

  const workbook = XLSX.read(downloadResult.fileContent, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

  const requiredHeaders = ['天数', '餐次', '菜品', '类别', '食材', '文字介绍', '关键词', '热量', '蛋白质', '脂肪', '碳水化合物', '主厨推荐']
  const actualHeaders = rows.length > 0 ? Object.keys(rows[0]) : []
  for (const header of requiredHeaders) {
    if (!actualHeaders.includes(header)) {
      throw new Error(`Excel 缺少必要列: ${header}`)
    }
  }

  const warnings = []
  const errors = []
  const dishesByName = new Map()
  const menusByDay = new Map()
  let supplementDishCount = 0

  rows.forEach((row, index) => {
    const mealCn = String(row['餐次'] || '').trim()
    const category = String(row['类别'] || '').trim()
    const dishName = String(row['菜品'] || '').trim()
    const dayRaw = row['天数']
    const rowNo = index + 2

    if (!mealCn || !category || !dishName) {
      return
    }

    if (!MEAL_TYPE_MAP[mealCn]) {
      errors.push(`第 ${rowNo} 行餐次非法: ${mealCn}`)
      return
    }

    const rules = MENU_RULES[`${mealCn}|${category}`]
    if (!rules) {
      errors.push(`第 ${rowNo} 行类别非法: ${mealCn} / ${category}`)
      return
    }

    const mealType = MEAL_TYPE_MAP[mealCn]

    dishesByName.set(dishName, {
      name: dishName,
      description: String(row['文字介绍'] || '').trim(),
      category,
      meal_type: mealType,
      ingredients: String(row['食材'] || '').trim(),
      keywords: normalizeKeywords(row['关键词']),
      chefRecommend: String(row['主厨推荐'] || '').trim() === '推荐',
      nutritional_info: {
        calories: row['热量'],
        protein: row['蛋白质'],
        fat: row['脂肪'],
        carbohydrates: row['碳水化合物']
      },
      store
    })

    if (mealCn === '高补品') {
      supplementDishCount += 1
      return
    }

    if (dayRaw === '' || dayRaw === null || dayRaw === undefined) {
      errors.push(`第 ${rowNo} 行缺少天数`)
      return
    }

    const day = Number(dayRaw)
    if (!Number.isInteger(day) || day < 1) {
      errors.push(`第 ${rowNo} 行天数非法: ${dayRaw}`)
      return
    }

    if (!menusByDay.has(day)) {
      menusByDay.set(day, {})
    }

    const dayMeals = menusByDay.get(day)
    if (!dayMeals[mealType]) {
      dayMeals[mealType] = {}
    }
    if (!dayMeals[mealType][category]) {
      dayMeals[mealType][category] = {
        selection_rule: rules.selection_rule,
        required_count: rules.required_count,
        dish_names: []
      }
    }

    dayMeals[mealType][category].dish_names.push(dishName)
  })

  return {
    sheetName,
    warnings,
    errors,
    supplementDishCount,
    dishes: Array.from(dishesByName.values()),
    dailyMenus: Array.from(menusByDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, meals]) => ({
        day,
        store,
        meals
      }))
  }
}

async function clearStoreMenuData(store) {
  await removeAllByStore('dishes', store)
  await removeAllByStore('daily_menus', store)
}

async function importParsedData(parsed, store) {
  const dishIdMap = new Map()
  const createdAt = new Date()

  for (const batch of chunkArray(parsed.dishes, 20)) {
    const results = await Promise.all(batch.map(dish =>
      db.collection('dishes').add({
        data: {
          ...dish,
          store,
          created_at: createdAt,
          status: 'active'
        }
      })
    ))

    batch.forEach((dish, index) => {
      if (results[index]?._id) {
        dishIdMap.set(dish.name, results[index]._id)
      }
    })
  }

  const processedMenus = parsed.dailyMenus.map(menu => processMenuWithDishIds(menu, dishIdMap))
  for (const batch of chunkArray(processedMenus, 20)) {
    await Promise.all(batch.map(menu =>
      db.collection('daily_menus').add({
        data: {
          ...menu,
          store,
          created_at: createdAt
        }
      })
    ))
  }

  return {
    dishCount: parsed.dishes.length,
    menuDayCount: parsed.dailyMenus.length
  }
}

function processMenuWithDishIds(menu, dishIdMap) {
  const processedMenu = {
    day: menu.day,
    meals: {}
  }

  for (const [mealType, mealData] of Object.entries(menu.meals)) {
    processedMenu.meals[mealType] = {}
    for (const [categoryName, categoryData] of Object.entries(mealData)) {
      const dishIds = categoryData.dish_names
        .map(dishName => dishIdMap.get(dishName))
        .filter(Boolean)

      processedMenu.meals[mealType][categoryName] = {
        selection_rule: categoryData.selection_rule,
        required_count: categoryData.required_count,
        dishes: dishIds
      }
    }
  }

  return processedMenu
}

function chunkArray(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function removeAllByStore(collectionName, store) {
  while (true) {
    const result = await db.collection(collectionName)
      .where({ store })
      .limit(PAGE_SIZE)
      .get()

    if (!result.data || result.data.length === 0) {
      break
    }

    for (const batch of chunkArray(result.data, 20)) {
      await Promise.all(batch.map(item => db.collection(collectionName).doc(item._id).remove()))
    }
  }
}

function normalizeKeywords(value) {
  if (!value) return []
  const raw = String(value)
  return raw
    .replace(/，/g, ',')
    .replace(/、/g, ',')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}
