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

const MENU_IMAGE_STATUS_CACHE_KEY = 'menu_manage_image_status_cache_v1'
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

      const resolvedItems = await this.resolveDishImageStatus(payload.items || [])
      const categoryItems = resolvedItems.filter((item) => item.categoryLabel === category)
      const missingItems = categoryItems.filter(item => !item.hasImage)
      const targetDishName = preferredDishName || this.data.selectedDishName
      const selectedDish = categoryItems.find((item) => item.name === targetDishName) || categoryItems[0] || null

      let selectedDishPreviewURL = selectedDish?.hasImage
        ? await this.resolveSingleDishPreview(selectedDish.fileID)
        : ''

      if (
        selectedDish &&
        this.data.optimisticPreviewDishName &&
        selectedDish.name === this.data.optimisticPreviewDishName &&
        this.data.optimisticPreviewURL
      ) {
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
        selectedDishHasImage: Boolean(selectedDish?.hasImage),
        selectedDishFileID: selectedDish?.fileID || '',
        selectedDishPreviewURL,
        selectedImagePath: '',
        selectedImageName: ''
      })
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

  async resolveDishImageStatus(items: DishImageItem[]) {
    if (!items.length) {
      return []
    }

    const fileStatusMap = new Map<string, boolean>()
    const chunkSize = 20

    for (let index = 0; index < items.length; index += chunkSize) {
      const chunk = items.slice(index, index + chunkSize)
      const fileItems = chunk.filter(item => Boolean(item.fileID))

      chunk
        .filter(item => !item.fileID)
        .forEach((item) => {
          fileStatusMap.set(item.fileID, false)
        })

      if (!fileItems.length) {
        continue
      }

      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: fileItems.map(item => item.fileID)
        })

        ;(result.fileList || []).forEach((file: any) => {
          fileStatusMap.set(file.fileID, file.status === 0 && Boolean(file.tempFileURL))
        })
      } catch (error) {
        fileItems.forEach((item) => {
          fileStatusMap.set(item.fileID, false)
        })
      }
    }

    return items.map((item) => ({
      ...item,
      hasImage: Boolean(fileStatusMap.get(item.fileID))
    }))
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
      return file?.status === 0 && file?.tempFileURL ? appendCacheBust(file.tempFileURL) : ''
    } catch (error) {
      console.error('获取菜品图片临时链接失败:', error)
      return ''
    }
  },

  onPreviewImageError(e: any) {
    console.error('菜品图片渲染失败:', {
      url: this.data.selectedDishPreviewURL,
      detail: e.detail
    })
  },

  previewSelectedDishImage() {
    if (!this.data.selectedDishPreviewURL) {
      return
    }

    wx.previewImage({
      current: this.data.selectedDishPreviewURL,
      urls: [this.data.selectedDishPreviewURL]
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
      const imageBase64 = wx.getFileSystemManager().readFileSync(
        this.data.selectedImagePath,
        'base64'
      ) as string

      const uploadResult = await wx.cloud.callFunction({
        name: 'uploadDishImage',
        data: {
          sessionToken: wx.getStorageSync('sessionToken'),
          dishName: this.data.selectedDishName,
          store: this.data.store,
          imageBase64
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

      this.setData({
        selectedDishHasImage: true,
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
      const friendlyMessage = /data exceed max size|parameter error/i.test(errorMessage)
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
  }
})
