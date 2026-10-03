import { withSupabase } from 'npm:@supabase/server@^1'

const APP_URL = 'https://donnerfaustsserverschmiede.github.io/Donnerfausts-Vineyard/'

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    try {
      const body = await req.json()
      const action = body?.action
      const currentUserId = ctx.userClaims?.sub

      if (action === 'change_password') {
        const password = String(body.password || '')
        if (!currentUserId || !password) return Response.json({ error: 'Passwort fehlt.' }, { status: 400 })
        if (password.length < 8) return Response.json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' }, { status: 400 })

        const { data: profile, error: profileError } = await ctx.supabaseAdmin
          .from('vineyard_profiles').select('user_id, active, must_change_password')
          .eq('user_id', currentUserId).maybeSingle()
        if (profileError || !profile || !profile.active) return Response.json({ error: 'Kein aktiver Mitarbeiterzugang.' }, { status: 403 })

        const { error: passwordError } = await ctx.supabaseAdmin.auth.admin.updateUserById(currentUserId, { password })
        if (passwordError) return Response.json({ error: passwordError.message }, { status: 400 })

        const { error: updateError } = await ctx.supabaseAdmin.from('vineyard_profiles')
          .update({ must_change_password: false }).eq('user_id', currentUserId)
        if (updateError) return Response.json({ error: updateError.message }, { status: 400 })

        await ctx.supabaseAdmin.from('vineyard_audit_log').insert({
          actor_id: currentUserId, action: 'Erstpasswort geändert', entity: 'employee',
          entity_id: currentUserId, details: { first_login_password_changed: true }
        })
        return Response.json({ ok: true })
      }

      const { data: master, error: masterError } = await ctx.supabase
        .from('vineyard_profiles').select('user_id, role_key, active')
        .eq('user_id', currentUserId).maybeSingle()
      if (masterError || !master || master.role_key !== 'master' || !master.active) {
        return Response.json({ error: 'Nur der Masteraccount darf Mitarbeiter verwalten.' }, { status: 403 })
      }

      if (action === 'create') {
        const email = String(body.email || '').trim().toLowerCase()
        const password = String(body.password || '')
        const displayName = String(body.display_name || '').trim()
        const roleKey = String(body.role_key || 'mitarbeiter')
        const phone = String(body.phone || '').trim() || null

        if (!email || !password || !displayName) return Response.json({ error: 'Name, E-Mail und Startpasswort sind erforderlich.' }, { status: 400 })
        if (password.length < 8) return Response.json({ error: 'Das Startpasswort muss mindestens 8 Zeichen haben.' }, { status: 400 })

        const { data: role } = await ctx.supabaseAdmin.from('vineyard_roles').select('key').eq('key', roleKey).maybeSingle()
        if (!role) return Response.json({ error: 'Ungültige Rolle.' }, { status: 400 })

        // Erst Einladung senden. Supabase verschickt dabei den Einladungslink.
        const redirectTo = APP_URL
        const { data: invited, error: inviteError } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: {
            name: displayName,
            role_key: roleKey,
            invited_by: currentUserId,
            barrelworks: 'Donnerfaust Barrelworks'
          }
        })
        if (inviteError) { console.error('Mitarbeiter-Einladung fehlgeschlagen:', inviteError); return Response.json({ error: 'Einladungs-E-Mail konnte nicht versendet werden: ' + inviteError.message }, { status: 400 }) }
        if (!invited?.user?.id) return Response.json({ error: 'Mitarbeiter konnte nicht angelegt werden.' }, { status: 500 })

        // Das vom Master gesetzte Startpasswort bleibt zusätzlich bestehen.
        const { error: passwordError } = await ctx.supabaseAdmin.auth.admin.updateUserById(invited.user.id, {
          password,
          user_metadata: { name: displayName, role_key: roleKey, must_change_password: true }
        })
        if (passwordError) {
          await ctx.supabaseAdmin.auth.admin.deleteUser(invited.user.id)
          return Response.json({ error: 'Startpasswort konnte nicht gesetzt werden: ' + passwordError.message }, { status: 400 })
        }

        const { error: profileError } = await ctx.supabaseAdmin.from('vineyard_profiles').insert({
          user_id: invited.user.id,
          display_name: displayName,
          role_key: roleKey,
          active: true,
          phone,
          must_change_password: true
        })
        if (profileError) {
          await ctx.supabaseAdmin.auth.admin.deleteUser(invited.user.id)
          return Response.json({ error: 'Mitarbeiterprofil konnte nicht angelegt werden: ' + profileError.message }, { status: 400 })
        }

        await ctx.supabaseAdmin.from('vineyard_audit_log').insert({
          actor_id: currentUserId, action: 'Mitarbeiter angelegt', entity: 'employee',
          entity_id: invited.user.id,
          details: { email, display_name: displayName, role_key: roleKey, invitation_sent: true, redirect_to: redirectTo }
        })

        return Response.json({ ok: true, user_id: invited.user.id, invitation_sent: true })
      }

      if (action === 'update') {
        const userId = String(body.user_id || '')
        if (!userId) return Response.json({ error: 'Mitarbeiter-ID fehlt.' }, { status: 400 })
        if (userId === currentUserId) return Response.json({ error: 'Der eigene Masteraccount kann hier nicht gelöscht oder umgewandelt werden.' }, { status: 400 })

        const displayName = body.display_name !== undefined ? String(body.display_name).trim() : undefined
        const roleKey = body.role_key !== undefined ? String(body.role_key) : undefined
        const active = body.active !== undefined ? Boolean(body.active) : undefined
        const phone = body.phone !== undefined ? (String(body.phone).trim() || null) : undefined
        const password = body.password !== undefined ? String(body.password) : undefined

        if (roleKey) {
          const { data: role } = await ctx.supabaseAdmin.from('vineyard_roles').select('key').eq('key', roleKey).maybeSingle()
          if (!role) return Response.json({ error: 'Ungültige Rolle.' }, { status: 400 })
        }

        const profilePatch: Record<string, unknown> = {}
        if (displayName !== undefined) profilePatch.display_name = displayName
        if (roleKey !== undefined) profilePatch.role_key = roleKey
        if (active !== undefined) profilePatch.active = active
        if (phone !== undefined) profilePatch.phone = phone
        if (password) {
          if (password.length < 8) return Response.json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' }, { status: 400 })
          profilePatch.must_change_password = true
        }

        if (Object.keys(profilePatch).length) {
          const { error } = await ctx.supabaseAdmin.from('vineyard_profiles').update(profilePatch).eq('user_id', userId)
          if (error) return Response.json({ error: error.message }, { status: 400 })
        }
        if (password) {
          const { error } = await ctx.supabaseAdmin.auth.admin.updateUserById(userId, { password })
          if (error) return Response.json({ error: error.message }, { status: 400 })
        }

        await ctx.supabaseAdmin.from('vineyard_audit_log').insert({
          actor_id: currentUserId, action: 'Mitarbeiter geändert', entity: 'employee',
          entity_id: userId, details: { ...profilePatch, password_changed: Boolean(password) }
        })
        return Response.json({ ok: true })
      }

      if (action === 'delete') {
        const userId = String(body.user_id || '')
        if (!userId) return Response.json({ error: 'Mitarbeiter-ID fehlt.' }, { status: 400 })
        if (userId === currentUserId) return Response.json({ error: 'Der eigene Masteraccount kann nicht gelöscht werden.' }, { status: 400 })

        const { data: target } = await ctx.supabaseAdmin.from('vineyard_profiles')
          .select('user_id, display_name, role_key').eq('user_id', userId).maybeSingle()
        if (!target) return Response.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 })
        if (target.role_key === 'master') return Response.json({ error: 'Ein Masteraccount kann nicht über die Mitarbeiterverwaltung gelöscht werden.' }, { status: 400 })

        await ctx.supabaseAdmin.from('vineyard_audit_log').update({ actor_id: null }).eq('actor_id', userId)
        await ctx.supabaseAdmin.from('vineyard_inventory').update({ updated_by: null }).eq('updated_by', userId)
        await ctx.supabaseAdmin.from('vineyard_cashbook').update({ created_by: null }).eq('created_by', userId)
        await ctx.supabaseAdmin.from('vineyard_recipes').update({ created_by: null, updated_by: null }).or('created_by.eq.' + userId + ',updated_by.eq.' + userId)
        await ctx.supabaseAdmin.from('vineyard_invoices').update({ created_by: currentUserId }).eq('created_by', userId)

        const { error: profileError } = await ctx.supabaseAdmin.from('vineyard_profiles').delete().eq('user_id', userId)
        if (profileError) return Response.json({ error: profileError.message }, { status: 400 })

        const { error: authError } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId)
        if (authError) return Response.json({ error: authError.message }, { status: 400 })

        await ctx.supabaseAdmin.from('vineyard_audit_log').insert({
          actor_id: currentUserId, action: 'Mitarbeiter gelöscht', entity: 'employee',
          entity_id: userId, details: { display_name: target.display_name, role_key: target.role_key }
        })
        return Response.json({ ok: true })
      }

      return Response.json({ error: 'Unbekannte Aktion.' }, { status: 400 })
    } catch (e) {
      console.error('vineyard-admin-users Fehler:', e)
      return Response.json({ error: e?.message || 'Interner Fehler.' }, { status: 500 })
    }
  })
}
