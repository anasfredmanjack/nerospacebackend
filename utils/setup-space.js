async function setupSpace() {
    try {
      const { create } = await import("@web3-storage/w3up-client")
      const client = await create()
  
      // 1. Login & plan
      const account = await client.login("anasfredmanjack@gmail.com")
      await account.plan.wait()
  
      // 2. Create & register your space
      const space = await client.createSpace("nerospace-user-uploads", { account })
      await client.setCurrentSpace(space.did())      // ← make it the “current” space
  
      // 3. Now delegate
      const abilities = [
        'space/blob/add',
        'space/index/add',
        'filecoin/offer',
        'upload/add',
      ]
  
      // Option A: to your own local agent
      //const audience = client.agent()
  
      // // Option B: to the account you logged in as
       const audience = account
  
      const delegation = await client.createDelegation(audience, abilities)
      console.log("✅ Delegation created")
      console.log("delegated DID:", space.did());

      console.log("Proof (store securely):", delegation.archive())
    } catch (error) {
      console.error("❌ Setup failed:", error)
    }
  }
  
  setupSpace()