/**
 * StorachaClient - A client for interacting with the Storacha API
 * Implementation following w3up-client documentation for production dapp usage
 */
class StorachaClient {
  private spaceDid: string
  private client: any = null
  private initialized = false

  constructor({ apiKey }: { apiKey: string }) {
    if (!apiKey) {
      throw new Error("Space DID is required")
    }

    this.spaceDid = apiKey // Your pre-authenticated space DID
  }

  /**
   * Initialize the Storacha client following w3up documentation
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Use dynamic import for ES modules with proper error handling
      console.log("Importing w3up-client...")

      // Use Function constructor to avoid TypeScript compilation issues
      const dynamicImport = new Function("specifier", "return import(specifier)")
      const w3upClient = await dynamicImport("@web3-storage/w3up-client")

      // Create the client as shown in w3up docs
      this.client = await w3upClient.create()
      console.log("W3up client created successfully")

      // Try to use your existing authenticated space
      await this.setupSpace()

      this.initialized = true
      console.log("Storacha client initialized successfully")
      console.log("Current space:", this.client.currentSpace()?.did())
    } catch (error) {
      console.error("Failed to initialize Storacha client:", error)
      throw new Error(`Storacha initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  /**
   * Setup space for uploads
   */
  private async setupSpace(): Promise<void> {
    try {
      // Check if we have access to the target space
      const spaces = this.client.spaces()
      const targetSpace = spaces.find((space: any) => space.did() === this.spaceDid)

      if (targetSpace) {
        // We have access to the space, use it
        await this.client.setCurrentSpace(this.spaceDid)
        console.log("Using authenticated space:", this.spaceDid)
        return
      }

      // If we don't have direct access, we need to use delegation
      console.log("Setting up space delegation...")
      await this.setupDelegation()
    } catch (error) {
      console.error("Space setup failed:", error)
      throw new Error(`Space setup failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  /**
   * Setup delegation for the space (if needed)
   */
  private async setupDelegation(): Promise<void> {
    try {
      // For production, you would typically have a pre-generated delegation
      // stored securely that grants upload permissions to any agent

      // If you have a delegation proof, add it here:
      // const dynamicImport = new Function('specifier', 'return import(specifier)')
      // const { parse } = await dynamicImport("@ucanto/core/delegation")
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

  async upload({ data, filename, contentType }: { data: Buffer | Uint8Array; filename: string; contentType: string }) {
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
      throw new Error(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  async uploadDirectory(files: Array<{ data: Buffer | Uint8Array; filename: string; contentType: string }>) {
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
      throw new Error(`Directory upload failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  async listUploads() {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const uploads: any[] = []

      // Try to use the capability API for listing uploads
      try {
        const results = await this.client.capability.upload.list()
        if (results.ok) {
          for (const upload of results.ok.results) {
            uploads.push({
              cid: upload.root.toString(),
              uploadedAt: upload.insertedAt || new Date().toISOString(),
              shards: upload.shards?.map((s: any) => s.toString()) || [],
            })
          }
        }
      } catch (listError) {
        console.warn("Capability API not available, trying legacy list method")
        // Fallback to legacy method if capability API is not available
        for await (const upload of this.client.list()) {
          uploads.push({
            cid: upload.root.toString(),
            uploadedAt: upload.insertedAt || new Date().toISOString(),
            shards: upload.shards?.map((s: any) => s.toString()) || [],
          })
        }
      }

      return uploads
    } catch (error) {
      console.error("Error listing uploads:", error)
      return [] // Return empty array instead of throwing
    }
  }

  async getUploadInfo(cid: string) {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!cid) throw new Error("CID is required")

    try {
      // Try to get upload info using capability API first
      try {
        const results = await this.client.capability.upload.list()
        if (results.ok) {
          const upload = results.ok.results.find((u: any) => u.root.toString() === cid)
          if (upload) {
            return {
              cid: upload.root.toString(),
              uploadedAt: upload.insertedAt || new Date().toISOString(),
              shards: upload.shards?.map((s: any) => s.toString()) || [],
            }
          }
        }
      } catch (capabilityError) {
        console.warn("Capability API not available for get operation")
      }

      // Fallback: try legacy get method
      const info = await this.client.get(cid)
      return {
        cid: info.root.toString(),
        uploadedAt: info.insertedAt || new Date().toISOString(),
        shards: info.shards?.map((s: any) => s.toString()) || [],
      }
    } catch (error) {
      console.error("Error getting upload info:", error)
      return null // Return null instead of throwing
    }
  }

  async removeUpload(cid: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!cid) throw new Error("CID is required")

    try {
      // Try capability API first
      try {
        const dynamicImport = new Function("specifier", "return import(specifier)")
        const { CID } = await dynamicImport("multiformats/cid")
        const parsedCid = CID.parse(cid)
        const result = await this.client.capability.upload.remove(parsedCid)

        if (result.ok) {
          console.log(`Upload removed: ${cid}`)
          return
        } else {
          throw new Error(`Failed to remove upload: ${result.error?.message || "Unknown error"}`)
        }
      } catch (capabilityError) {
        console.warn("Capability API not available for remove operation, trying legacy method")
        // Fallback to legacy remove method
        await this.client.remove(cid)
        console.log(`Upload removed: ${cid}`)
      }
    } catch (error) {
      console.error("Error removing upload:", error)
      throw new Error(`Failed to remove upload: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  /**
   * Get current space information
   */
  getCurrentSpace(): string | undefined {
    return this.client?.currentSpace()?.did()
  }

  /**
   * Check if client is properly initialized and has space access
   */
  isReady(): boolean {
    return this.initialized && !!this.client?.currentSpace()
  }
}

export default StorachaClient
