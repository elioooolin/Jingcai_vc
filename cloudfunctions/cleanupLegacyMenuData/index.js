const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const TARGETS = ['dishes', 'daily_menus']
const PAGE_SIZE = 100
const DELETE_BATCH_SIZE = 20

exports.main = async (event) => {
  const { action = 'preview', sessionToken } = event || {}

  try {
    const currentUser = await getCurrentUser({ sessionToken })
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '需要管理员权限'
      }
    }

    const preview = await buildCleanupPreview()

    if (action === 'preview') {
      return {
        success: true,
        action: 'preview',
        preview
      }
    }

    if (action !== 'cleanup') {
      return {
        success: false,
        error: 'INVALID_ACTION',
        message: 'action 仅支持 preview 或 cleanup'
      }
    }

    const cleanupResult = await cleanupLegacyRecords(preview)
    return {
      success: true,
      action: 'cleanup',
      preview,
      result: cleanupResult,
      message: '历史无门店字段菜单数据清理完成'
    }
  } catch (error) {
    console.error('清理历史菜单数据失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '清理历史菜单数据失败'
    }
  }
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

async function buildCleanupPreview() {
  const preview = {}

  for (const collectionName of TARGETS) {
    const records = await fetchCollectionRecords(collectionName)
    const legacyRecords = records.filter(isLegacyRecord)

    preview[collectionName] = {
      count: legacyRecords.length,
      sample: legacyRecords.slice(0, 10).map(toPreviewItem(collectionName))
    }
  }

  return preview
}

async function cleanupLegacyRecords(preview) {
  const result = {}

  for (const collectionName of TARGETS) {
    const legacyIds = preview[collectionName].sample.map(item => item._id)
    let allLegacyIds = legacyIds

    if (preview[collectionName].count > legacyIds.length) {
      const records = await fetchCollectionRecords(collectionName)
      allLegacyIds = records.filter(isLegacyRecord).map(item => item._id)
    }

    let deletedCount = 0
    for (const batch of chunkArray(allLegacyIds, DELETE_BATCH_SIZE)) {
      await Promise.all(batch.map(id => db.collection(collectionName).doc(id).remove()))
      deletedCount += batch.length
    }

    result[collectionName] = {
      deletedCount
    }
  }

  return result
}

async function fetchCollectionRecords(collectionName) {
  const records = []
  let skip = 0

  while (true) {
    const result = await db.collection(collectionName)
      .skip(skip)
      .limit(PAGE_SIZE)
      .get()

    const page = result.data || []
    records.push(...page)

    if (page.length < PAGE_SIZE) {
      break
    }

    skip += PAGE_SIZE
  }

  return records
}

function isLegacyRecord(record) {
  if (!Object.prototype.hasOwnProperty.call(record, 'store')) {
    return true
  }

  if (record.store === null || record.store === undefined) {
    return true
  }

  if (typeof record.store === 'string' && record.store.trim() === '') {
    return true
  }

  return false
}

function toPreviewItem(collectionName) {
  return (record) => {
    if (collectionName === 'dishes') {
      return {
        _id: record._id,
        name: record.name || '',
        category: record.category || '',
        meal_type: record.meal_type || '',
        store: record.store
      }
    }

    return {
      _id: record._id,
      day: record.day,
      store: record.store
    }
  }
}

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
