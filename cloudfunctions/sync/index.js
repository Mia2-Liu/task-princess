const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLL = 'tp_sync'

async function ensureCollection() {
  try {
    await db.createCollection(COLL)
  } catch (e) {
    // 已存在时忽略
  }
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext()
  const action = event && event.action

  if (!OPENID) {
    return { ok: false, error: 'no openid' }
  }

  await ensureCollection()

  try {
    if (action === 'pull') {
      const res = await db.collection(COLL).where({ openid: OPENID }).limit(1).get()
      const doc = res.data[0]
      return {
        ok: true,
        doc: doc
          ? {
              tasks: doc.tasks || [],
              categories: doc.categories || [],
              updatedAt: doc.updatedAt || 0
            }
          : null
      }
    }

    if (action === 'push') {
      const payload = {
        openid: OPENID,
        tasks: Array.isArray(event.tasks) ? event.tasks : [],
        categories: Array.isArray(event.categories) ? event.categories : [],
        updatedAt: event.updatedAt || Date.now()
      }
      const res = await db.collection(COLL).where({ openid: OPENID }).limit(1).get()
      if (res.data[0]) {
        await db.collection(COLL).doc(res.data[0]._id).update({ data: payload })
      } else {
        await db.collection(COLL).add({ data: payload })
      }
      return { ok: true }
    }

    return { ok: false, error: 'unknown action' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
