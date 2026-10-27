mkdir V9.34.3-ULTIMATE
# copy 6 file tadi ke dalam folder itu
cd V9.34.3-ULTIMATE
npm init -y
npm i express dotenv

# Jadikan ZIP
zip -r V9.34.3-ULTIMATE.zip .

# Upload ke GitHub
git init
git add .
git commit -m "V9.34.3 ULTIMATE - MT5 TETAP LOGIN + History Ping Tele"
git branch -M main
git remote add origin https://ghp_TOKEN@github.com/USERNAME/XAU-V9.34.3.git
git push -u origin main

# Jalankan di VPS
pm2 start ecosystem.config.js
pm2 save
pm2 startup