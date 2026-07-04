interface DishImageItem {
  id: string;
  name: string;
  categoryLabel: string;
  fileID: string;
  hasImage?: boolean;
}

function appendCacheBust(url: string) {
  return url || ''
}

const MENU_IMAGE_STATUS_CACHE_KEY = 'menu_manage_image_status_cache_v2'
const IMAGE_RENDER_CACHE_KEY = 'dish_image_render_cache_v1'
const IMAGE_RENDER_CACHE_TTL = 30 * 60 * 1000
const MAX_IMAGE_EDGE = 1024
const TARGET_LOCAL_UPLOAD_SIZE = 150 * 1024
const COMPRESS_QUALITY_STEPS = [40, 30, 25, 20, 15]

Page({
  data: {
    loading: true,
    isReadOnly: false,
    uploading: false,
    store: '',
    category: '菜品',
    totalDishCount: 0,
    placeholderDishCount: 0,
    missingItems: [] as DishImageItem[],
    categoryItems: [] as DishImageItem[],
    filteredDishOptions: [] as DishImageItem[],
    dishSearchKeyword: '',
    dishDropdownVisible: false,
    selectedDishName: '',
    selectedDishId: '',
    selectedDishCategoryLabel: '',
    selectedDishHasImage: false,
    selectedDishFileID: '',
    selectedDishPreviewURL: '',
    optimisticPreviewDishName: '',
    optimisticPreviewURL: '',
    selectedImagePath: '',
    selectedImageName: ''
  },

  onLoad(options?: Record<string, string>) {
    const userInfo = wx.getStorageSync('userInfo') || {}
    const role = userInfo.role || userInfo.userType

    if (!['admin', 'staff'].includes(role)) {
      wx.reLaunch({
        url: '/pages/login/login'
      })
      return
    }

    const store = options?.store ? decodeURIComponent(options.store) : ''
    const category = options?.category ? decodeURIComponent(options.category) : '菜品'

    this.setData({
      isReadOnly: role === 'staff',
      store,
      category
    })

    this.loadImageStatus(store, category)
  },

  async loadImageStatus(store: string, category: string, preferredDishName?: string) {
    this.setData({ loading: true })

    try {
      const result = await wx.cloud.callFunction({
        name: 'getStoreDishImageStatus',
        data: {
          store,
          sessionToken: wx.getStorageSync('sessionToken')
        }
      })

      const payload = result.result as any
      if (!payload?.success) {
        throw new Error(payload?.message || '加载图片状态失败')
      }

      const rawItems = payload.items || []
      const quickItems = this.buildQuickDishImageStatus(rawItems)
      await this.applyResolvedItems(quickItems, category, preferredDishName)
      this.setData({ loading: false })

      const resolvedItems = await this.resolveDishImageStatus(rawItems)
      await this.applyResolvedItems(resolvedItems, category, preferredDishName)
    } catch (error: any) {
      wx.showToast({
        title: error?.message || '加载失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async applyResolvedItems(resolvedItems: DishImageItem[], category: string, preferredDishName?: string) {
    const categoryItems = resolvedItems.filter((item) => item.categoryLabel === category)
    const missingItems = categoryItems.filter(item => !item.hasImage)
    const targetDishName = preferredDishName || this.data.selectedDishName
    const selectedDish = categoryItems.find((item) => item.name === targetDishName) || categoryItems[0] || null

    let selectedDishPreviewURL = selectedDish?.hasImage
      ? await this.resolveSingleDishPreview(selectedDish.fileID)
      : ''

    const shouldUseOptimisticPreview = Boolean(
      selectedDish &&
      this.data.optimisticPreviewDishName &&
      selectedDish.name === this.data.optimisticPreviewDishName &&
      this.data.optimisticPreviewURL &&
      this.data.selectedDishFileID &&
      selectedDish?.fileID !== this.data.selectedDishFileID
    )

    if (shouldUseOptimisticPreview) {
      selectedDishPreviewURL = this.data.optimisticPreviewURL
    }

    this.setData({
      totalDishCount: categoryItems.length,
      placeholderDishCount: missingItems.length,
      missingItems,
      categoryItems,
      filteredDishOptions: categoryItems,
      dishSearchKeyword: selectedDish?.name || '',
      dishDropdownVisible: false,
      selectedDishName: selectedDish?.name || '',
      selectedDishId: selectedDish?.id || '',
      selectedDishCategoryLabel: selectedDish?.categoryLabel || category,
      selectedDishHasImage: Boolean(selectedDish?.hasImage),
      selectedDishFileID: selectedDish?.fileID || '',
      selectedDishPreviewURL,
      optimisticPreviewDishName: shouldUseOptimisticPreview ? this.data.optimisticPreviewDishName : '',
      optimisticPreviewURL: shouldUseOptimisticPreview ? this.data.optimisticPreviewURL : '',
      selectedImagePath: '',
      selectedImageName: ''
    })
  },

  buildQuickDishImageStatus(items: DishImageItem[]) {
    return items.map((item) => {
      const cachedStatus = item.fileID ? this.getCachedRenderStatus(item.fileID) : null
      return {
        ...item,
        hasImage: cachedStatus !== null ? cachedStatus : Boolean(item.fileID)
      }
    })
  },

  async resolveDishImageStatus(items: DishImageItem[]) {
    if (!items.length) {
      return []
    }

    const fileStatusMap = new Map<string, boolean>()
    const chunkSize = 8

    for (let index = 0; index < items.length; index += chunkSize) {
      const chunk = items.slice(index, index + chunkSize)
      const fileItems: DishImageItem[] = []

      chunk.forEach((item) => {
        if (!item.fileID) {
          fileStatusMap.set(item.fileID, false)
          return
        }

        const cachedStatus = this.getCachedRenderStatus(item.fileID)
        if (cachedStatus !== null) {
          fileStatusMap.set(item.fileID, cachedStatus)
          return
        }

        fileItems.push(item)
      })

      if (!fileItems.length) {
        continue
      }

      await Promise.all(fileItems.map(async (item) => {
        const isRenderable = await this.canRenderCloudImage(item.fileID)
        fileStatusMap.set(item.fileID, isRenderable)
        this.setCachedRenderStatus(item.fileID, isRenderable)
      }))
    }

    return items.map((item) => ({
      ...item,
      hasImage: Boolean(fileStatusMap.get(item.fileID))
    }))
  },

  async canRenderCloudImage(fileID: string): Promise<boolean> {
    if (!fileID) {
      return false
    }

    try {
      const downloadResult = await wx.cloud.downloadFile({ fileID })
      return await this.canRenderImage(downloadResult.tempFilePath)
    } catch (error) {
      console.warn('云图片下载或渲染失败:', { fileID, error })
      return false
    }
  },

  canRenderImage(src: string): Promise<boolean> {
    return new Promise((resolve) => {
      wx.getImageInfo({
        src,
        success: () => resolve(true),
        fail: (error) => {
          console.warn('图片临时链接无法渲染:', { src, error })
          resolve(false)
        }
      })
    })
  },

  getCachedRenderStatus(fileID: string): boolean | null {
    try {
      const cache = wx.getStorageSync(IMAGE_RENDER_CACHE_KEY) || {}
      const cached = cache[fileID]
      if (!cached || typeof cached.ok !== 'boolean' || !cached.timestamp) {
        return null
      }

      if (Date.now() - cached.timestamp > IMAGE_RENDER_CACHE_TTL) {
        return null
      }

      return cached.ok
    } catch (error) {
      console.warn('读取图片渲染缓存失败:', error)
      return null
    }
  },

  setCachedRenderStatus(fileID: string, ok: boolean) {
    if (!fileID) return

    try {
      const cache = wx.getStorageSync(IMAGE_RENDER_CACHE_KEY) || {}
      cache[fileID] = {
        ok,
        timestamp: Date.now()
      }
      wx.setStorageSync(IMAGE_RENDER_CACHE_KEY, cache)
    } catch (error) {
      console.warn('写入图片渲染缓存失败:', error)
    }
  },

  async resolveSingleDishPreview(fileID: string) {
    if (!fileID) return ''

    try {
      const result = await wx.cloud.getTempFileURL({
        fileList: [fileID]
      })
      const file = result.fileList?.[0]
      console.log('菜品图片临时链接结果:', {
        fileID,
        status: file?.status,
        errMsg: file?.errMsg,
        hasTempFileURL: Boolean(file?.tempFileURL)
      })
      return file?.status === 0 ? fileID : ''
    } catch (error) {
      console.error('获取菜品图片临时链接失败:', error)
      return fileID
    }
  },

  onPreviewImageError(e: any) {
    console.error('菜品图片渲染失败:', {
      url: this.data.selectedDishPreviewURL,
      detail: e.detail
    })

    const selectedDishId = this.data.selectedDishId
    const selectedDishName = this.data.selectedDishName
    const markAsMissing = (items: DishImageItem[]) => items.map((item) => {
      if (selectedDishId ? item.id === selectedDishId : item.name === selectedDishName) {
        return {
          ...item,
          hasImage: false
        }
      }

      return item
    })

    const categoryItems = markAsMissing(this.data.categoryItems)
    const filteredDishOptions = markAsMissing(this.data.filteredDishOptions)
    const missingItems = categoryItems.filter(item => !item.hasImage)

    this.setData({
      categoryItems,
      filteredDishOptions,
      missingItems,
      placeholderDishCount: missingItems.length,
      selectedDishPreviewURL: '',
      selectedDishHasImage: false
    })
  },

  previewSelectedDishImage() {
    if (!this.data.selectedDishPreviewURL) {
      return
    }

    const previewURL = this.data.selectedDishPreviewURL
    if (!previewURL.startsWith('cloud://')) {
      wx.previewImage({
        current: previewURL,
        urls: [previewURL]
      })
      return
    }

    wx.cloud.getTempFileURL({
      fileList: [previewURL]
    }).then((result) => {
      const tempURL = result.fileList?.[0]?.tempFileURL
      wx.previewImage({
        current: tempURL || previewURL,
        urls: [tempURL || previewURL]
      })
    }).catch(() => {
      wx.previewImage({
        current: previewURL,
        urls: [previewURL]
      })
    })
  },

  onDishKeywordInput(e: any) {
    const keyword = String(e.detail.value || '').trim()
    const filteredDishOptions = this.filterDishOptions(keyword)

    this.setData({
      dishSearchKeyword: keyword,
      filteredDishOptions,
      dishDropdownVisible: true
    })
  },

  onDishKeywordFocus() {
    this.setData({
      filteredDishOptions: this.filterDishOptions(this.data.dishSearchKeyword),
      dishDropdownVisible: true
    })
  },

  filterDishOptions(keyword: string) {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) {
      return this.data.categoryItems
    }

    return this.data.categoryItems.filter((item) =>
      item.name.toLowerCase().includes(normalized)
    )
  },

  async selectDishOption(e: any) {
    const id = e.currentTarget.dataset.id
    const selectedDish = this.data.categoryItems.find(item => item.id === id)
    const selectedDishPreviewURL = selectedDish?.hasImage
      ? await this.resolveSingleDishPreview(selectedDish.fileID)
      : ''

    this.setData({
      selectedDishName: selectedDish?.name || '',
      selectedDishId: selectedDish?.id || '',
      selectedDishCategoryLabel: selectedDish?.categoryLabel || this.data.category,
      dishSearchKeyword: selectedDish?.name || '',
      selectedDishHasImage: Boolean(selectedDish?.hasImage),
      selectedDishFileID: selectedDish?.fileID || '',
      selectedDishPreviewURL,
      optimisticPreviewDishName: selectedDish?.name === this.data.optimisticPreviewDishName ? this.data.optimisticPreviewDishName : '',
      optimisticPreviewURL: selectedDish?.name === this.data.optimisticPreviewDishName ? this.data.optimisticPreviewURL : '',
      dishDropdownVisible: false,
      selectedImagePath: '',
      selectedImageName: ''
    })
  },

  hideDishDropdown() {
    this.setData({ dishDropdownVisible: false })
  },

  async chooseImage() {
    if (this.data.isReadOnly || !this.data.selectedDishName) {
      return
    }

    try {
      const result = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
        sizeType: ['compressed']
      })

      const file = result.tempFiles?.[0]
      if (!file?.tempFilePath) {
        return
      }

      const optimizedImage = await this.prepareImageForUpload(file.tempFilePath, file.size || 0)
      if (!optimizedImage) {
        return
      }

      const imageName = optimizedImage.size
        ? `已选择图片（${Math.round(optimizedImage.size / 1024)}KB）`
        : '已选择图片'
      this.setData({
        selectedImagePath: optimizedImage.path,
        selectedImageName: imageName
      })
    } catch (error) {
      console.error('选择图片失败:', error)
    }
  },

  async prepareImageForUpload(filePath: string, originalSize: number) {
    let workingPath = filePath
    let workingSize = originalSize || await this.getLocalFileSize(filePath)
    let workingInfo = await this.getImageInfo(filePath)

    for (const quality of COMPRESS_QUALITY_STEPS) {
      try {
        const compressed = await this.compressImage(
          workingPath,
          quality,
          workingInfo?.width,
          workingInfo?.height
        )
        const compressedSize = await this.getLocalFileSize(compressed.tempFilePath)
        const compressedInfo = await this.getImageInfo(compressed.tempFilePath)

        if (compressedSize > 0) {
          workingPath = compressed.tempFilePath
          workingSize = compressedSize
          workingInfo = compressedInfo
        }

        if (workingSize <= TARGET_LOCAL_UPLOAD_SIZE) {
          return {
            path: workingPath,
            size: workingSize
          }
        }
      } catch (error) {
        console.error(`压缩图片失败，quality=${quality}:`, error)
      }
    }

    wx.showToast({
      title: '图片较大，将尝试继续上传',
      icon: 'none',
      duration: 2000
    })

    return {
      path: workingPath,
      size: workingSize
    }
  },

  async getImageInfo(src: string): Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult | null> {
    try {
      return await wx.getImageInfo({ src })
    } catch (error) {
      console.error('读取图片信息失败:', error)
      return null
    }
  },

  compressImage(
    src: string,
    quality: number,
    width?: number,
    height?: number
  ): Promise<WechatMiniprogram.CompressImageSuccessCallbackResult> {
    let compressedWidth = width
    let compressedHeight = height

    if (width && height && (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE)) {
      if (width >= height) {
        compressedWidth = MAX_IMAGE_EDGE
        compressedHeight = Math.round((MAX_IMAGE_EDGE / width) * height)
      } else {
        compressedHeight = MAX_IMAGE_EDGE
        compressedWidth = Math.round((MAX_IMAGE_EDGE / height) * width)
      }
    }

    return new Promise((resolve, reject) => {
      wx.compressImage({
        src,
        quality,
        compressedWidth,
        compressedHeight,
        success: resolve,
        fail: reject
      })
    })
  },

  getLocalFileSize(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      wx.getFileSystemManager().getFileInfo({
        filePath,
        success: (res) => resolve(res.size || 0),
        fail: () => resolve(0)
      })
    })
  },

  async uploadSelectedImage() {
    if (this.data.isReadOnly || this.data.uploading) {
      return
    }

    if (!this.data.selectedDishName) {
      wx.showToast({
        title: '请先选择菜品',
        icon: 'none'
      })
      return
    }

    if (!this.data.selectedImagePath) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }

    this.setData({ uploading: true })

    try {
      const cloudPath = this.buildDishImageCloudPath(this.data.selectedDishName)

      if (this.data.selectedDishFileID) {
        try {
          await wx.cloud.deleteFile({
            fileList: [this.data.selectedDishFileID]
          })
        } catch (error) {
          console.warn('删除旧菜品图片失败，继续上传新图:', error)
        }
      }

      const storageResult = await wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.selectedImagePath
      })

      const uploadResult = await wx.cloud.callFunction({
        name: 'uploadDishImage',
        data: {
          sessionToken: wx.getStorageSync('sessionToken'),
          dishId: this.data.selectedDishId,
          dishName: this.data.selectedDishName,
          categoryLabel: this.data.selectedDishCategoryLabel || this.data.category,
          store: this.data.store,
          fileID: storageResult.fileID
        }
      })

      const payload = uploadResult.result as any
      if (!payload?.success) {
        throw new Error(payload?.message || '上传失败')
      }

      const localPreviewURL = this.data.selectedImagePath

      wx.showToast({
        title: this.data.selectedDishHasImage ? '图片已更新' : '图片上传成功',
        icon: 'success'
      })

      wx.removeStorageSync(MENU_IMAGE_STATUS_CACHE_KEY)
      this.setCachedRenderStatus(payload.fileID || storageResult.fileID || '', true)

      this.setData({
        selectedDishHasImage: true,
        selectedDishFileID: payload.fileID || storageResult.fileID || '',
        selectedDishPreviewURL: localPreviewURL,
        optimisticPreviewDishName: this.data.selectedDishName,
        optimisticPreviewURL: localPreviewURL,
        selectedImagePath: '',
        selectedImageName: ''
      })

      setTimeout(() => {
        this.loadImageStatus(this.data.store, this.data.category, this.data.selectedDishName)
      }, 1200)
    } catch (error: any) {
      const errorMessage = String(error?.message || error?.errMsg || '')
      const friendlyMessage = /storage permission denied/i.test(errorMessage)
        ? '云存储无上传权限，请检查当前环境的 Storage 权限'
        : /data exceed max size|parameter error/i.test(errorMessage)
        ? '图片过大，请重新选择更小的图片'
        : (error?.message || '上传失败')

      wx.showToast({
        title: friendlyMessage,
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ uploading: false })
    }
  },

  buildDishImageCloudPath(dishName: string) {
    return `dish_pics/${this.sanitizeDishImageFileName(dishName)}.JPG`
  },

  sanitizeDishImageFileName(dishName: string) {
    return String(dishName || '')
      .trim()
      .replace(/[+]/g, '＋')
      .replace(/[\\/:*?"<>|#%&=]/g, '_')
  }
})
