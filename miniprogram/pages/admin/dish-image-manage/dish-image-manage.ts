interface DishImageItem {
  id: string;
  name: string;
  categoryLabel: string;
  fileID: string;
  hasImage?: boolean;
}

function appendCacheBust(url: string) {
  if (!url) return ''
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${Date.now()}`
}

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
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: chunk.map(item => item.fileID)
        })

        ;(result.fileList || []).forEach((file: any) => {
          fileStatusMap.set(file.fileID, file.status === 0 && Boolean(file.tempFileURL))
        })
      } catch (error) {
        chunk.forEach((item) => {
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
      return file?.status === 0 && file?.tempFileURL ? appendCacheBust(file.tempFileURL) : ''
    } catch (error) {
      return ''
    }
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
        sourceType: ['album']
      })

      const file = result.tempFiles?.[0]
      if (!file?.tempFilePath) {
        return
      }

      const imageName = file.size ? `已选择图片（${Math.round(file.size / 1024)}KB）` : '已选择图片'
      this.setData({
        selectedImagePath: file.tempFilePath,
        selectedImageName: imageName
      })
    } catch (error) {
      console.error('选择图片失败:', error)
    }
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

    const cloudPath = `dish_pics/${this.data.selectedDishName}.JPG`

    this.setData({ uploading: true })

    try {
      try {
        await wx.cloud.deleteFile({
          fileList: [cloudPath]
        })
      } catch (error) {
        // Ignore delete failures so first-time upload still works.
      }

      await wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.selectedImagePath
      })

      const localPreviewURL = this.data.selectedImagePath

      wx.showToast({
        title: this.data.selectedDishHasImage ? '图片已更新' : '图片上传成功',
        icon: 'success'
      })

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
      wx.showToast({
        title: error?.message || '上传失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ uploading: false })
    }
  }
})
