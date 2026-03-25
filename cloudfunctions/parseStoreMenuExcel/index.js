const cloud = require('wx-server-sdk')
const XLSX = require('xlsx')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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

    const preview = await parseExcelFile(fileID, store)
    return {
      success: true,
      preview
    }
  } catch (error) {
    console.error('解析餐单 Excel 失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '解析餐单 Excel 失败'
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
  const daySet = new Set()
  const menuOptionCounter = new Map()
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

    if (!MENU_RULES[`${mealCn}|${category}`]) {
      errors.push(`第 ${rowNo} 行类别非法: ${mealCn} / ${category}`)
      return
    }

    dishesByName.set(dishName, {
      name: dishName,
      description: String(row['文字介绍'] || '').trim(),
      category,
      meal_type: MEAL_TYPE_MAP[mealCn],
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

    daySet.add(day)

    const optionKey = `${day}|${mealCn}|${category}`
    if (!menuOptionCounter.has(optionKey)) {
      menuOptionCounter.set(optionKey, new Set())
    }
    menuOptionCounter.get(optionKey).add(dishName)
  })

  const dayList = Array.from(daySet).sort((a, b) => a - b)

  dayList.forEach((day) => {
    Object.entries(MENU_RULES).forEach(([ruleKey, rule]) => {
      if (rule.required_count <= 0) {
        return
      }

      const [mealCn, category] = ruleKey.split('|')
      const optionKey = `${day}|${mealCn}|${category}`
      const optionCount = menuOptionCounter.has(optionKey)
        ? menuOptionCounter.get(optionKey).size
        : 0

      if (optionCount < rule.required_count) {
        warnings.push(
          `第 ${day} 天${mealCn}${category}可选菜品数不足：当前仅 ${optionCount} 项，用户需可选 ${rule.required_count} 项`
        )
      }
    })
  })

  return {
    store,
    fileID,
    fileName: fileID.split('/').pop() || fileID,
    sheetName,
    rowCount: rows.length,
    dishCount: dishesByName.size,
    menuDayCount: dayList.length,
    minDay: dayList.length > 0 ? dayList[0] : null,
    maxDay: dayList.length > 0 ? dayList[dayList.length - 1] : null,
    supplementDishCount,
    warnings,
    errors
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
