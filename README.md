```shell
cp config.ini.example config.ini
vi config.ini
# 修改內容
# [工號] = hroa 的帳號
# [密碼] = hroa 的密碼
# [地址],[緯度],[經度] = 
# 可以使用 https://maps.googleapis.com/maps/api/geocode/json?latlng=緯度,經度&key=AIzaSyCg5Sqnpz3tBtGoFZaqWyis_u7Pf7q_jvA&language=en 來取得；
# 亦或是登入後打開 Networking 從 https://hroa-apis-dot-project-newagent1-prod-product.as.r.appspot.com/dashboard/attendance/state/load 查看返回的 address 與lat,lng
# 如果遊覽器信息想修改可以修改 agent
# checkin_time 是上班時間
# checkin_random_range_minutes 是隨機增加分鐘數
# checkout_time 是下班時間
# checkout_random_range_minutes 下班隨機增加分鐘
# workday_week 會執行的星期

# pm2 啟動永駐監測
pm2 start ecosystem.config.js

# 登入並打卡上班 (系統排程用)
node main.js --checkin
# 登入並打卡上班 (系統排程用)
node main.js --checkin
```