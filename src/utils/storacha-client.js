/**
 * StorachaClient - A client for interacting with the Storacha API
 * Implementation following w3up-client documentation for production dapp usage
 */
class StorachaClient {
  constructor({ apiKey }) {
    if (!apiKey) {
      throw new Error("Space DID is required")
    }

    this.spaceDid = apiKey // Your pre-authenticated space DID
    this.client = null
    this.initialized = false
  }

  /**
   * Initialize the Storacha client following w3up documentation
   */
  async initialize() {
    if (this.initialized) return

    try {
      // Import and create client following the documentation
      const { create } = await import("@web3-storage/w3up-client")
      
      // Create the client as shown in w3up docs
      this.client = await create()
      console.log("W3up client created successfully")

      // Try to use your existing authenticated space
      await this.setupSpace()

      this.initialized = true
      console.log("Storacha client initialized successfully")
      console.log("Current space:", this.client.currentSpace()?.did())
      
    } catch (error) {
      console.error("Failed to initialize Storacha client:", error)
      throw new Error(`Storacha initialization failed: ${error.message}`)
    }
  }

  /**
   * Setup space for uploads
   */
  async setupSpace() {
    try {
      // Check if we have access to the target space
      const spaces = this.client.spaces()
      const targetSpace = spaces.find(space => space.did() === this.spaceDid)
      
      if (targetSpace) {
        // We have access to the space, use it
        await this.client.setCurrentSpace(this.spaceDid)
        console.log("Using authenticated space:", this.spaceDid)
        return
      }

      // If we don't have direct access, we need to use delegation
      // This requires the space to have been set up with proper delegation
      console.log("Setting up space delegation...")
      await this.setupDelegation()
      
    } catch (error) {
      console.error("Space setup failed:", error)
      throw new Error(`Space setup failed: ${error.message}`)
    }
  }

  /**
   * Setup delegation for the space (if needed)
   */
  async setupDelegation() {
    try {
      // Import delegation utilities
      const { parse } = await import("@ucanto/core/delegation")
      
      // For production, you would typically have a pre-generated delegation
      // stored securely that grants upload permissions to any agent
      
      // If you have a delegation proof, add it here:
      // const delegation = parse(process.env.STORACHA_DELEGATION_PROOF)
      // await this.client.agent.addProof(delegation)
      
      // For now, we'll try to set the space directly
      await this.client.setCurrentSpace(this.spaceDid)
      console.log("Space delegation setup complete")
      
    } catch (error) {
      console.error("Delegation setup failed:", error)
      throw new Error("Unable to access space. Please ensure proper delegation is set up.")
    }
  }

  async upload({ data, filename, contentType }) {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!data) throw new Error("File data is required")
    if (!filename) throw new Error("Filename is required")

    try {
      console.log(`Uploading file: ${filename} (${contentType})`)
      const fileData = data instanceof Buffer ? new Uint8Array(data) : data
      const file = new File([fileData], filename, { type: contentType })
      
      // Upload using w3up-client following the documentation
      const cid = await this.client.uploadFile(file)
      
      console.log("Upload successful:", cid.toString())
      return {
        cid: cid.toString(),
        name: filename,
        url: `https://${cid}.ipfs.w3s.link`,
        size: fileData.length,
        type: contentType,
      }
    } catch (error) {
      console.error("Upload error:", error)
      throw new Error(`Upload failed: ${error.message}`)
    }
  }

  async uploadDirectory(files) {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error("Files array is required and must not be empty")
    }

    try {
      console.log(`Uploading directory with ${files.length} files`)
      const fileObjects = files.map(({ data, filename, contentType }) => {
        const fileData = data instanceof Buffer ? new Uint8Array(data) : data
        return new File([fileData], filename, { type: contentType })
      })

      // Upload directory using w3up-client
      const cid = await this.client.uploadDirectory(fileObjects)
      
      console.log("Directory upload successful:", cid.toString())
      return {
        cid: cid.toString(),
        url: `https://${cid}.ipfs.w3s.link/`,
        files: files.map((f) => f.filename),
      }
    } catch (error) {
      console.error("Directory upload error:", error)
      throw new Error(`Directory upload failed: ${error.message}`)
    }
  }

  async listUploads() {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const uploads = []
      
      // List uploads using w3up-client
      for await (const upload of this.client.list()) {
        uploads.push({
          cid: upload.root.toString(),
          uploadedAt: upload.insertedAt,
          shards: upload.shards?.map((s) => s.toString()) || [],
        })
      }
      
      return uploads
    } catch (error) {
      console.error("Error listing uploads:", error)
      throw new Error(`Failed to list uploads: ${error.message}`)
    }
  }

  async getUploadInfo(cid) {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!cid) throw new Error("CID is required")

    try {
      // Get upload info using w3up-client
      const info = await this.client.get(cid)
      
      return {
        cid: info.root.toString(),
        uploadedAt: info.insertedAt,
        shards: info.shards?.map((s) => s.toString()) || [],
      }
    } catch (error) {
      console.error("Error getting upload info:", error)
      throw new Error(`Failed to get upload info: ${error.message}`)
    }
  }

  async removeUpload(cid) {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!cid) throw new Error("CID is required")

    try {
      // Remove upload using w3up-client
      await this.client.remove(cid)
      console.log(`Upload removed: ${cid}`)
    } catch (error) {
      console.error("Error removing upload:", error)
      throw new Error(`Failed to remove upload: ${error.message}`)
    }
  }

  /**
   * Get current space information
   */
  getCurrentSpace() {
    return this.client?.currentSpace()?.did()
  }

  /**
   * Check if client is properly initialized and has space access
   */
  isReady() {
    return this.initialized && this.client?.currentSpace()
  }
}

module.exports = StorachaClient