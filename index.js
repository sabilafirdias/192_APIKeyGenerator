const express = require('express')
const path = require('path')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const db = require('./database')

const app = express()
const port = 3001

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

// ==========================
// GENERATE API KEY (TIDAK SIMPAN KE DB)
// ==========================
app.post('/create', (req, res) => {
  try {
    const apiKey = `sk-sm-v1-${crypto.randomBytes(16).toString('hex').toUpperCase()}`
    res.json({ success: true, apiKey })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})

// ==========================
// SAVE USER + SIMPAN APIKEY
// ==========================
app.post('/save-user', (req, res) => {
  const { firstName, lastName, email, apiKey } = req.body

  if (!apiKey) return res.status(400).json({ success: false, message: "API key kosong" })

  // 1. Simpan API Key dulu
  const now = new Date()
  const queryKey = `INSERT INTO apikey (\`key\`, out_of_date) VALUES (?, ?)`

  db.query(queryKey, [apiKey, now], (err, result) => {
    if (err) return res.status(500).json({ success: false })

    const apikeyId = result.insertId

    // 2. Simpan User
    const queryUser = `
      INSERT INTO user (first_name, last_name, email, apikey_id)
      VALUES (?, ?, ?, ?)
    `

    db.query(queryUser, [firstName, lastName, email, apikeyId], (err2) => {
      if (err2) return res.status(500).json({ success: false })

      res.json({ success: true })
    })
  })
})

// ==========================
// DELETE USER + APIKEY
// ==========================
app.delete('/delete-user/:id', (req, res) => {
  const userId = req.params.id

  // 1. Ambil dulu apikey_id user-nya
  const getUserQuery = `SELECT apikey_id FROM user WHERE id = ?`

  db.query(getUserQuery, [userId], (err, result) => {
    if (err || result.length === 0) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" })
    }

    const apikeyId = result[0].apikey_id

    // 2. Hapus user
    const deleteUserQuery = `DELETE FROM user WHERE id = ?`
    db.query(deleteUserQuery, [userId], (err2) => {
      if (err2) return res.status(500).json({ success: false })

      // 3. Hapus API key terkait
      const deleteKeyQuery = `DELETE FROM apikey WHERE id = ?`
      db.query(deleteKeyQuery, [apikeyId], (err3) => {
        if (err3) return res.status(500).json({ success: false })

        return res.json({ success: true })
      })
    })
  })
})


// ==========================
// ADMIN REGISTER
// ==========================
app.post('/register-admin', async (req, res) => {
  const { email, password } = req.body

  const hash = await bcrypt.hash(password, 10)

  db.query(
    `INSERT INTO admin (email, password) VALUES (?, ?)`,
    [email, hash],
    (err) => {
      if (err) return res.status(500).json({ success: false })
      res.json({ success: true })
    }
  )
})

// ==========================
// ADMIN LOGIN
// ==========================
app.post('/login-admin', (req, res) => {
  const { email, password } = req.body

  db.query(`SELECT * FROM admin WHERE email = ?`, [email], async (err, results) => {
    if (err || results.length === 0)
      return res.status(401).json({ success: false })

    const admin = results[0]
    const match = await bcrypt.compare(password, admin.password)

    if (!match) return res.status(401).json({ success: false })

    res.json({ success: true })
  })
})

// ==========================
// ADMIN DASHBOARD DATA
// ==========================
app.get('/dashboard-data', (req, res) => {
  const queryUsers = `SELECT * FROM user`
  const queryKeys = `SELECT * FROM apikey`

  db.query(queryUsers, (err, users) => {
    if (err) return res.status(500).json({ success: false })

    db.query(queryKeys, (err2, keys) => {
      if (err2) return res.status(500).json({ success: false })

      const enrichedKeys = keys.map(k => {
        const diff = (new Date() - new Date(k.out_of_date)) / (1000 * 60 * 60 * 24)
        return {
          ...k,
          status: diff > 30 ? 'offline' : 'online'
        }
      })

      res.json({
        success: true,
        users,
        apikeys: enrichedKeys
      })
    })
  })
})

app.listen(port, () => {
  console.log(`🚀 Running http://localhost:${port}`)
})