const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const PAGE_SIZE = 100
const VALID_EXTENSIONS = ['JPG', 'jpg', 'JPEG', 'jpeg', 'PNG', 'png']

exports.main = async (event = {}) => {
  const {
    store,
    bucket,
    limit = 5,
    offset = 0,
    dryRun = false,
    force = false,
    validateImages = true,
    dishName = ''
  } = event

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
    const targetDishName = String(dishName || '').trim()
    const candidates = dishes.filter((dish) => {
      const name = String(dish.name || '').trim()
      if (!name) return false
      if (targetDishName && name !== targetDishName) return false
      if (force) return true
      return isEncodedDishFileId(dish.imageFileId)
    })

    const normalizedOffset = Math.max(0, Number(offset) || 0)
    const normalizedLimit = Math.max(1, Math.min(10, Number(limit) || 5))
    const batch = candidates.slice(normalizedOffset, normalizedOffset + normalizedLimit)

    const migrated = []
    const skipped = []
    const missing = []
    const failed = []

    for (const dish of batch) {
      try {
        const result = await migrateOneDish({ dish, bucket, dryRun, validateImages })
        if (result.status === 'migrated') {
          migrated.push(result)
        } else if (result.status === 'missing') {
          missing.push(result)
        } else {
          skipped.push(result)
        }
      } catch (error) {
        failed.push({
          dishId: dish._id,
          name: dish.name,
          message: error.message || String(error)
        })
      }
    }

    return {
      success: true,
      message: dryRun ? '编码图片迁移预检完成' : '编码图片迁移批次完成',
      result: {
        store,
        bucket,
        dryRun,
        force,
        validateImages,
        dishName: targetDishName,
        totalCandidateCount: candidates.length,
        batchOffset: normalizedOffset,
        batchLimit: normalizedLimit,
        batchCount: batch.length,
        migratedCount: migrated.length,
        skippedCount: skipped.length,
        missingCount: missing.length,
        failedCount: failed.length,
        hasMore: normalizedOffset + normalizedLimit < candidates.length,
        nextOffset: normalizedOffset + normalizedLimit,
        migrated,
        skipped,
        missing,
        failed
      }
    }
  } catch (error) {
    console.error('迁移编码菜品图片失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '迁移编码菜品图片失败'
    }
  }
}

async function migrateOneDish({ dish, bucket, dryRun, validateImages }) {
  const name = String(dish.name || '').trim()
  const targetFileID = buildTargetFileId(bucket, name)
  const sourceFileIDs = buildEncodedCandidateFileIds(bucket, name, dish.imageFileId)

  const existingTarget = await firstExistingFileId([targetFileID])
  if (existingTarget) {
    const targetValidation = validateImages
      ? await validateImageFileId(existingTarget)
      : { ok: true }

    if (!targetValidation.ok) {
      const sourceFileID = await firstValidImageFileId(sourceFileIDs)
      if (!sourceFileID) {
        return {
          status: 'missing',
          dishId: dish._id,
          name,
          targetFileID,
          invalidTarget: {
            fileID: existingTarget,
            reason: targetValidation.reason,
            bytes: targetValidation.bytes
          },
          checkedFileIDs: sourceFileIDs
        }
      }

      if (dryRun) {
        return {
          status: 'migrated',
          dishId: dish._id,
          name,
          sourceFileID,
          targetFileID,
          invalidTarget: {
            fileID: existingTarget,
            reason: targetValidation.reason,
            bytes: targetValidation.bytes
          },
          dryRun: true
        }
      }

      const repaired = await copyImageFile({ sourceFileID, targetCloudPath: `dish_pics/${sanitizeDishImageFileName(name)}.JPG` })
      await updateDishImageFileId(dish._id, repaired.fileID)

      return {
        status: 'migrated',
        dishId: dish._id,
        name,
        sourceFileID,
        targetFileID: repaired.fileID,
        invalidTarget: {
          fileID: existingTarget,
          reason: targetValidation.reason,
          bytes: targetValidation.bytes
        },
        bytes: repaired.bytes
      }
    }

    if (!dryRun) {
      await updateDishImageFileId(dish._id, existingTarget)
    }
    return {
      status: 'migrated',
      dishId: dish._id,
      name,
      sourceFileID: existingTarget,
      targetFileID: existingTarget,
      reusedExistingTarget: true
    }
  }

  const sourceFileID = validateImages
    ? await firstValidImageFileId(sourceFileIDs)
    : await firstExistingFileId(sourceFileIDs)
  if (!sourceFileID) {
    return {
      status: 'missing',
      dishId: dish._id,
      name,
      checkedFileIDs: sourceFileIDs
    }
  }

  if (dryRun) {
    return {
      status: 'migrated',
      dishId: dish._id,
      name,
      sourceFileID,
      targetFileID,
      dryRun: true
    }
  }

  const uploadResult = await copyImageFile({
    sourceFileID,
    targetCloudPath: `dish_pics/${sanitizeDishImageFileName(name)}.JPG`
  })

  await updateDishImageFileId(dish._id, uploadResult.fileID)

  return {
    status: 'migrated',
    dishId: dish._id,
    name,
    sourceFileID,
    targetFileID: uploadResult.fileID,
    bytes: uploadResult.bytes
  }
}

async function copyImageFile({ sourceFileID, targetCloudPath }) {
  const downloadResult = await cloud.downloadFile({
    fileID: sourceFileID
  })

  const fileContent = downloadResult.fileContent
  const validation = validateImageBuffer(fileContent)
  if (!validation.ok) {
    throw new Error(`源图片不是有效图片: ${validation.reason}`)
  }

  const uploadResult = await cloud.uploadFile({
    cloudPath: targetCloudPath,
    fileContent
  })

  return {
    fileID: uploadResult.fileID,
    bytes: fileContent.length
  }
}

async function firstExistingFileId(fileIDs) {
  const uniqueFileIDs = Array.from(new Set(fileIDs.filter(Boolean)))

  for (const batch of chunkArray(uniqueFileIDs, 50)) {
    const result = await cloud.getTempFileURL({
      fileList: batch
    })
    const found = (result.fileList || []).find((item) => item.status === 0 && item.tempFileURL)
    if (found) {
      return found.fileID
    }
  }

  return ''
}

async function firstValidImageFileId(fileIDs) {
  const existingFileIDs = []
  const uniqueFileIDs = Array.from(new Set(fileIDs.filter(Boolean)))

  for (const batch of chunkArray(uniqueFileIDs, 50)) {
    const result = await cloud.getTempFileURL({
      fileList: batch
    })
    ;(result.fileList || []).forEach((item) => {
      if (item.status === 0 && item.tempFileURL) {
        existingFileIDs.push(item.fileID)
      }
    })
  }

  for (const fileID of existingFileIDs) {
    const validation = await validateImageFileId(fileID)
    if (validation.ok) {
      return fileID
    }
  }

  return ''
}

async function validateImageFileId(fileID) {
  try {
    const downloadResult = await cloud.downloadFile({ fileID })
    return validateImageBuffer(downloadResult.fileContent)
  } catch (error) {
    return {
      ok: false,
      reason: error.message || String(error),
      bytes: 0
    }
  }
}

function validateImageBuffer(fileContent) {
  if (!fileContent || !fileContent.length) {
    return {
      ok: false,
      reason: 'EMPTY_FILE',
      bytes: 0
    }
  }

  const bytes = fileContent.length
  const isJpeg = fileContent.length >= 3 &&
    fileContent[0] === 0xff &&
    fileContent[1] === 0xd8 &&
    fileContent[2] === 0xff
  const isPng = fileContent.length >= 8 &&
    fileContent[0] === 0x89 &&
    fileContent[1] === 0x50 &&
    fileContent[2] === 0x4e &&
    fileContent[3] === 0x47

  if (isJpeg || isPng) {
    return {
      ok: true,
      bytes
    }
  }

  return {
    ok: false,
    reason: 'NOT_IMAGE_BYTES',
    bytes
  }
}

async function updateDishImageFileId(dishId, fileID) {
  await db.collection('dishes').doc(dishId).update({
    data: {
      imageFileId: fileID,
      imageUpdatedAt: new Date()
    }
  })
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

function buildTargetFileId(bucket, dishName) {
  return `cloud://${bucket}/dish_pics/${sanitizeDishImageFileName(dishName)}.JPG`
}

function buildEncodedCandidateFileIds(bucket, dishName, currentFileID) {
  const normalizedName = String(dishName || '').trim()
  const encodedName = encodeURIComponent(normalizedName)
  const candidateSet = new Set()

  if (isEncodedDishFileId(currentFileID)) {
    candidateSet.add(String(currentFileID).trim())
  }

  VALID_EXTENSIONS.forEach((ext) => {
    candidateSet.add(`cloud://${bucket}/dish_pics/${encodedName}.${ext}`)
  })

  return Array.from(candidateSet)
}

function isEncodedDishFileId(fileID) {
  return /\/dish_pics\/%[0-9A-Fa-f]{2}/.test(String(fileID || ''))
}

function sanitizeDishImageFileName(dishName) {
  return String(dishName || '')
    .trim()
    .replace(/[+]/g, '＋')
    .replace(/[\\/:*?"<>|#%&=]/g, '_')
}

function chunkArray(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}
