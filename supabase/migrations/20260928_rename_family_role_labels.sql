update public.vineyard_roles
set label = case key
  when 'kasse' then '🥂 STUBENBEDIENSTETE'
  when 'winzerlehrling' then '🌱 LEHRLING'
  when 'winzer' then '🍇 WINZER/BRAUER'
  else label
end
where key in ('kasse','winzerlehrling','winzer');