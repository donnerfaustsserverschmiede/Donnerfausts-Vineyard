import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://donnerfaustsserverschmiede.github.io/Donnerfausts-Vineyard/'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })
    if (req.method !== 'POST') return json({ error: 'Nur POST ist erlaubt.' }, 405)

    try {
      const auth = req.headers.get('Authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
      if (!token) return json({ error: 'Nicht angemeldet. Bitte neu anmelden.' }, 401)

      const { data: authData, error: authError } = await admin.auth.getUser(token)
      if (authError || !authData.user) return json({ error: 'Sitzung ist ungültig oder abgelaufen. Bitte neu anmelden.' }, 401)
      const currentUserId = authData.user.id

      const body = await req.json()
      const action = body?.action

      if (action === 'change_password') {
        const password = String(body.password || '')
        if (password.length < 8) return json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' }, 400)

        const { data: profile, error: profileError } = await admin
          .from('vineyard_profiles').select('user_id, active')
          .eq('user_id', currentUserId).maybeSingle()
        if (profileError || !profile || !profile.active) return json({ error: 'Kein aktiver Mitarbeiterzugang.' }, 403)

        const { error: passwordError } = await admin.auth.admin.updateUserById(currentUserId, { password })
        if (passwordError) return json({ error: passwordError.message }, 400)

        const { error: updateError } = await admin.from('vineyard_profiles')
          .update({ must_change_password: false }).eq('user_id', currentUserId)
        if (updateError) return json({ error: updateError.message }, 400)

        await admin.from('vineyard_audit_log').insert({
          actor_id: currentUserId, action: 'Erstpasswort geändert', entity: 'employee',
          entity_id: currentUserId, details: { first_login_password_changed: true }
        })
        return json({ ok: true })
      }

      const { data: master, error: masterError } = await admin
        .from('vineyard_profiles').select('user_id, role_key, active')
        .eq('user_id', currentUserId).maybeSingle()
      if (masterError || !master || master.role_key !== 'master' || !master.active) {
        return json({ error: 'Nur der Masteraccount darf Mitarbeiter verwalten.' }, 403)
      }

      if (action === 'repair') {
        const { data: employees, error } = await admin.from('vineyard_profiles').select('user_id').neq('role_key', 'master')
        if (error) return json({ error: error.message }, 400)
        for (const employee of employees || []) {
          await admin.auth.admin.updateUserById(employee.user_id, { email_confirm: true })
        }
        return json({ ok: true })
      }

      if (action === 'create') {
        const email = String(body.email || '').trim().toLowerCase()
        const password = String(body.password || '')
        const displayName = String(body.display_name || '').trim()
        const roleKey = String(body.role_key || 'mitarbeiter')
        const phone = String(body.phone || '').trim() || null

        if (!email || !password || !displayName) return json({ error: 'Name, E-Mail und Startpasswort sind erforderlich.' }, 400)
        if (password.length < 8) return json({ error: 'Das Startpasswort muss mindestens 8 Zeichen haben.' }, 400)

        const { data: role } = await admin.from('vineyard_roles').select('key').eq('key', roleKey).maybeSingle()
        if (!role) return json({ error: 'Ungültige Rolle.' }, 400)

        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: APP_URL,
          data: { name: displayName, role_key: roleKey, invited_by: currentUserId, barrelworks: 'Donnerfaust Barrelworks' }
        })
        if (inviteError) return json({ error: 'Einladungs-E-Mail konnte nicht versendet werden: ' + inviteError.message }, 400)
        if (!invited?.user?.id) return json({ error: 'Mitarbeiter konnte nicht angelegt werden.' }, 500)

        const { error: passwordError } = await admin.auth.admin.updateUserById(invited.user.id, {
          password,
          email_confirm: true,
          user_metadata: { name: displayName, role_key: roleKey, must_change_password: true }
        })
        if (passwordError) {
          await admin.auth.admin.deleteUser(invited.user.id)
          return json({ error: 'Startpasswort konnte nicht gesetzt werden: ' + passwordError.message }, 400)
        }

        const { error: profileError } = await admin.from('vineyard_profiles').insert({
          user_id: invited.user.id, display_name: displayName, role_key: roleKey,
          active: true, phone, must_change_password: true
        })
        if (profileError) {
          await admin.auth.admin.deleteUser(invited.user.id)
          return json({ error: 'Mitarbeiterprofil konnte nicht angelegt werden: ' + profileError.message }, 400)
        }

        await admin.from('vineyard_audit_log').insert({
          actor_id: currentUserId, action: 'Mitarbeiter angelegt', entity: 'employee',
          entity_id: invited.user.id,
          details: { email, display_name: displayName, role_key: roleKey, invitation_sent: true, redirect_to: APP_URL }
        })

        return json({ ok: true, user_id: invited.user.id, invitation_sent: true })
      }

      if (action === 'update') {
        const userId = String(body.user_id || '')
        if (!userId) return json({ error: 'Mitarbeiter-ID fehlt.' }, 400)
        if (userId === currentUserId) return json({ error: 'Der eigene Masteraccount kann hier nicht gelöscht oder umgewandelt werden.' }, 400)

        const displayName = body.display_name !== undefined ? String(body.display_name).trim() : undefined
        const roleKey = body.role_key !== undefined ? String(body.role_key) : undefined
        const active = body.active !== undefined ? Boolean(body.active) : undefined
        const phone = body.phone !== undefined ? (String(body.phone).trim() || null) : undefined
        const password = body.password !== undefined ? String(body.password) : undefined

        if (roleKey) {
          const { data: role } = await admin.from('vineyard_roles').select('key').eq('key', roleKey).maybeSingle()
          if (!role) return json({ error: 'Ungültige Rolle.' }, 400)
        }

        const profilePatch: Record<string, unknown> = {}
        if (displayName !== undefined) profilePatch.display_name = displayName
        if (roleKey !== undefined) profilePatch.role_key = roleKey
        if (active !== undefined) profilePatch.active = active
        if (phone !== undefined) profilePatch.phone = phone
        if (password) {
          if (password.length < 8) return json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' }, 400)
          profilePatch.must_change_password = true
        }

        if (Object.keys(profilePatch).length) {
          const { error } = await admin.from('vineyard_profiles').update(profilePatch).eq('user_id', userId)
          if (error) return json({ error: error.message }, 400)
        }
        if (password) {
          const { error } = await admin.auth.admin.updateUserById(userId, { password })
          if (error) return json({ error: error.message }, 400)
        }

        await admin.from('vineyard_audit_log').insert({
          actor_id: currentUserId, action: 'Mitarbeiter geändert', entity: 'employee',
          entity_id: userId, details: { ...profilePatch, password_changed: Boolean(password) }
        })
        return json({ ok: true })
      }

      if (action === 'delete') {
        const userId = String(body.user_id || '')
        if (!userId) return json({ error: 'Mitarbeiter-ID fehlt.' }, 400)
        if (userId === currentUserId) return json({ error: 'Der eigene Masteraccount kann nicht gelöscht werden.' }, 400)

        const { data: target } = await admin.from('vineyard_profiles')
          .select('user_id, display_name, role_key').eq('user_id', userId).maybeSingle()
        if (!target) return json({ error: 'Mitarbeiter nicht gefunden.' }, 404)
        if (target.role_key === 'master') return json({ error: 'Ein Masteraccount kann nicht über die Mitarbeiterverwaltung gelöscht werden.' }, 400)

        await admin.from('vineyard_audit_log').update({ actor_id: null }).eq('actor_id', userId)
        await admin.from('vineyard_inventory').update({ updated_by: null }).eq('updated_by', userId)
        await admin.from('vineyard_cashbook').update({ created_by: null }).eq('created_by', userId)
        await admin.from('vineyard_recipes').update({ created_by: null, updated_by: null }).or('created_by.eq.' + userId + ',updated_by.eq.' + userId)
        await admin.from('vineyard_invoices').update({ created_by: currentUserId }).eq('created_by', userId)

        const { error: profileError } = await admin.from('vineyard_profiles').delete().eq('user_id', userId)
        if (profileError) return json({ error: profileError.message }, 400)

        const { error: authError } = await admin.auth.admin.deleteUser(userId)
        if (authError) return json({ error: authError.message }, 400)

        await admin.from('vineyard_audit_log').insert({
          actor_id: currentUserId, action: 'Mitarbeiter gelöscht', entity: 'employee',
          entity_id: userId, details: { display_name: target.display_name, role_key: target.role_key }
        })
        return json({ ok: true })
      }

      return json({ error: 'Unbekannte Aktion.' }, 400)
    } catch (e) {
      console.error('vineyard-admin-users Fehler:', e)
      return json({ error: e?.message || 'Interner Fehler.' }, 500)
    }
  }
}
