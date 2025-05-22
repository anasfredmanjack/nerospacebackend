/**
 * StorachaClient - A client for interacting with the Storacha API
 * Implementation based on official Storacha documentation
 */
class StorachaClient {
  /**
   * Create a new Storacha client
   * @param {Object} options - Client options
   * @param {string} options.apiKey - Storacha API key (DID key format)
   */
  constructor({ apiKey }) {
    this.apiKey = apiKey
    this.baseUrl = "https://api.storacha.network/v1"
  }

  /**
   * Upload a file to IPFS via Storacha
   * @param {Object} options - Upload options
   * @param {Buffer|Uint8Array|Blob} options.data - File data as Buffer, Uint8Array, or Blob
   * @param {string} options.filename - Original filename
   * @param {string} options.contentType - MIME type of the file
   * @returns {Promise<Object>} - Upload response with CID
   */
  async upload({ data, filename, contentType }) {
    if (!this.apiKey) {
      throw new Error("Storacha API key is required")
    }

    if (!data) {
      throw new Error("File data is required")
    }

    try {
      // Create form data for the upload
      const formData = new FormData()

      // Create a file object from the data
      let fileObject

      if (typeof Blob !== "undefined" && data instanceof Blob) {
        // Browser environment
        fileObject = new File([data], filename, { type: contentType })
      } else {
        // Node.js environment
        fileObject = new Blob([data], { type: contentType })
      }

      // Add file to form data
      formData.append("file", fileObject, filename)

      // Upload to Storacha
      const response = await fetch(`${this.baseUrl}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          // Let FormData set its own headers for multipart/form-data
        },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.error || response.statusText
        } catch (e) {
          errorMessage = errorText || response.statusText
        }
        throw new Error(`Storacha upload failed: ${errorMessage}`)
      }

      const result = await response.json()

      // Return CID and gateway URL according to documentation
      return {
        cid: result.cid,
        url: `https://${result.cid}.ipfs.w3s.link/${encodeURIComponent(filename)}`,
      }
    } catch (error) {
      console.error("Storacha upload error:", error)
      throw error
    }
  }

  /**
   * Get file metadata from Storacha
   * @param {string} cid - Content ID of the file
   * @returns {Promise<Object>} - File metadata
   */
  async getMetadata(cid) {
    if (!this.apiKey) {
      throw new Error("Storacha API key is required")
    }

    if (!cid) {
      throw new Error("CID is required")
    }

    try {
      const response = await fetch(`${this.baseUrl}/metadata/${cid}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.error || response.statusText
        } catch (e) {
          errorMessage = errorText || response.statusText
        }
        throw new Error(`Failed to get metadata: ${errorMessage}`)
      }

      return await response.json()
    } catch (error) {
      console.error("Storacha metadata error:", error)
      throw error
    }
  }

  /**
   * List files in your space
   * @param {Object} options - List options
   * @param {number} [options.limit=100] - Maximum number of items to return
   * @param {number} [options.offset=0] - Number of items to skip
   * @returns {Promise<Object>} - List of files
   */
  async listFiles({ limit = 100, offset = 0 } = {}) {
    if (!this.apiKey) {
      throw new Error("Storacha API key is required")
    }

    try {
      const response = await fetch(`${this.baseUrl}/files?limit=${limit}&offset=${offset}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.error || response.statusText
        } catch (e) {
          errorMessage = errorText || response.statusText
        }
        throw new Error(`Failed to list files: ${errorMessage}`)
      }

      return await response.json()
    } catch (error) {
      console.error("Storacha list files error:", error)
      throw error
    }
  }

  /**
   * Delete a file from your space
   * @param {string} cid - Content ID of the file to delete
   * @returns {Promise<Object>} - Deletion response
   */
  async deleteFile(cid) {
    if (!this.apiKey) {
      throw new Error("Storacha API key is required")
    }

    if (!cid) {
      throw new Error("CID is required")
    }

    try {
      const response = await fetch(`${this.baseUrl}/files/${cid}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.error || response.statusText
        } catch (e) {
          errorMessage = errorText || response.statusText
        }
        throw new Error(`Failed to delete file: ${errorMessage}`)
      }

      return await response.json()
    } catch (error) {
      console.error("Storacha delete file error:", error)
      throw error
    }
  }

  /**
   * Upload a directory to IPFS via Storacha
   * @param {Array<File>} files - Array of File objects
   * @returns {Promise<Object>} - Upload response with directory CID
   */
  async uploadDirectory(files) {
    if (!this.apiKey) {
      throw new Error("Storacha API key is required")
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error("Files array is required")
    }

    try {
      const formData = new FormData()

      // Add each file to the form data
      for (const file of files) {
        formData.append("files", file, file.name)
      }

      const response = await fetch(`${this.baseUrl}/upload/directory`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.error || response.statusText
        } catch (e) {
          errorMessage = errorText || response.statusText
        }
        throw new Error(`Storacha directory upload failed: ${errorMessage}`)
      }

      const result = await response.json()

      return {
        cid: result.cid,
        url: `https://${result.cid}.ipfs.w3s.link/`,
      }
    } catch (error) {
      console.error("Storacha directory upload error:", error)
      throw error
    }
  }
}

module.exports = StorachaClient
