const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const PAGE_SIZE = 100
const VALID_EXTENSIONS = ['JPG', 'jpg', 'JPEG', 'jpeg', 'PNG', 'png']

exports.main = async (event = {}) => {
  const { store, bucket, force = false, limit = 8, offset = 0 } = event

  try {
    if (!store || !bucket) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少 store 或 bucket 参数'
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

    const dishes = await getAllByWhere('dishes', { store })
    const targetDishes = dishes.filter((dish) => {
      const name = String(dish.name || '').trim()
      if (!name) {
        return false
      }
      if (force) {
        return true
      }
      return !String(dish.imageFileId || '').trim()
    })
    const normalizedOffset = Math.max(0, Number(offset) || 0)
    const normalizedLimit = Math.max(1, Math.min(20, Number(limit) || 8))
    const targetBatch = targetDishes.slice(normalizedOffset, normalizedOffset + normalizedLimit)

    if (!targetDishes.length) {
      return {
        success: true,
        message: '没有需要恢复图片关联的菜品',
        result: {
          store,
          matchedCount: 0,
          skippedCount: dishes.length,
          updatedDishNames: [],
          missingDishNames: []
        }
      }
    }

    if (!targetBatch.length) {
      return {
        success: true,
        message: '本批次没有需要恢复的菜品',
        result: {
          store,
          bucket,
          totalCandidateCount: targetDishes.length,
          batchOffset: normalizedOffset,
          batchLimit: normalizedLimit,
          batchCount: 0,
          matchedCount: 0,
          skippedCount: dishes.length - targetDishes.length,
          updatedDishNames: [],
          missingDishNames: [],
          hasMore: false,
          nextOffset: normalizedOffset
        }
      }
    }

    const candidateMap = new Map()
    const candidateFileIds = []

    targetBatch.forEach((dish) => {
      const name = String(dish.name || '').trim()
      const candidates = buildCandidateFileIds(bucket, name)
      candidateMap.set(dish._id, {
        dish,
        candidates
      })
      candidateFileIds.push(...candidates)
    })

    const statusMap = await resolveFileStatuses(candidateFileIds)
    const updates = []
    const updatedDishNames = []
    const missingDishNames = []

    candidateMap.forEach(({ dish, candidates }) => {
      const matchedFileId = candidates.find((fileID) => statusMap.get(fileID) === true)
      if (!matchedFileId) {
        missingDishNames.push(String(dish.name || '').trim())
        return
      }

      updates.push(
        db.collection('dishes').doc(dish._id).update({
          data: {
            imageFileId: matchedFileId,
            imageUpdatedAt: new Date()
          }
        })
      )
      updatedDishNames.push(String(dish.name || '').trim())
    })

    for (const batch of chunkArray(updates, 20)) {
      await Promise.all(batch)
    }

    return {
      success: true,
      message: `图片关联恢复完成，成功 ${updatedDishNames.length} 道`,
      result: {
        store,
        bucket,
        totalCandidateCount: targetDishes.length,
        batchOffset: normalizedOffset,
        batchLimit: normalizedLimit,
        batchCount: targetBatch.length,
        scannedDishCount: targetBatch.length,
        matchedCount: updatedDishNames.length,
        skippedCount: dishes.length - targetDishes.length,
        updatedDishNames,
        missingDishNames,
        hasMore: normalizedOffset + normalizedLimit < targetDishes.length,
        nextOffset: normalizedOffset + normalizedLimit
      }
    }
  } catch (error) {
    console.error('恢复菜品图片关联失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '恢复菜品图片关联失败'
    }
  }
}

async function resolveFileStatuses(fileIDs) {
  const statusMap = new Map()

  for (const batch of chunkArray(fileIDs, 50)) {
    const result = await cloud.getTempFileURL({
      fileList: batch
    })

    ;(result.fileList || []).forEach((item) => {
      statusMap.set(item.fileID, item.status === 0 && Boolean(item.tempFileURL))
    })
  }

  return statusMap
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

async function getAllByWhere(collectionName, where) {
  const results = []
  let skip = 0

  while (true) {
    const result = await db.collection(collectionName)
      .where(where)
      .skip(skip)
      .limit(PAGE_SIZE)
      .get()

    const currentBatch = result.data || []
    results.push(...currentBatch)

    if (currentBatch.length < PAGE_SIZE) {
      break
    }

    skip += PAGE_SIZE
  }

  return results
}

function chunkArray(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function buildCandidateFileIds(bucket, dishName) {
  const normalizedName = String(dishName || '').trim()
  const encodedName = encodeURIComponent(normalizedName)
  const sanitizedName = sanitizeDishImageFileName(normalizedName)
  const candidateSet = new Set()

  VALID_EXTENSIONS.forEach((ext) => {
    candidateSet.add(`cloud://${bucket}/dish_pics/${normalizedName}.${ext}`)
    candidateSet.add(`cloud://${bucket}/dish_pics/${sanitizedName}.${ext}`)
    candidateSet.add(`cloud://${bucket}/dish_pics/${encodedName}.${ext}`)
  })

  return Array.from(candidateSet)
}

function sanitizeDishImageFileName(dishName) {
  return String(dishName || '')
    .trim()
    .replace(/[+]/g, '＋')
    .replace(/[\\/:*?"<>|#%&=]/g, '_')
}
