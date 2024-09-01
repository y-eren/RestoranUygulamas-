const express = require('express');
const path = require("path")
const hbs = require('hbs');
const client = require("./database.js");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const session = require("express-session")
dotenv.config();
const app = express();


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


client.connect((err) => {
  if (err) {
    console.error('Veritabanına bağlanırken bir hata oluştu:', err.stack);
    return;
  }
  console.log('Veritabanına başarıyla bağlandı.');
});


app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));

app.use(express.static("views"));


app.use(session({
  secret: "gizli_kelime",
  resave: false,
  saveUninitialized: false
}))

app.get("/", (req,res) => {
  res.render("index")
})



app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});


process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

function gracefulShutdown() {
  console.log('Sunucu kapatılıyor...');
  
  
  // Veritabanı bağlantısını kapat
  client.end(() => {
    console.log('Veritabanı bağlantısı kapatıldı');
    
  });
  
}


app.post('/register', async (req, res) => {
  const { email, username, password } = req.body;
  
  try {
     await client.query(
          'INSERT INTO kullanici (email,username, password) VALUES ($1, $2, $3) RETURNING *',
          [email,username, password]
      );
      res.render("index")
  } catch (err) {
      console.error('Veritabanı hatası:', err);
      res.status(500).send('Sunucu hatası');
  }
});

app.post("/", async(req,res) => {
  try {
    let formData ={
      email :req.body.email,
      password : req.body.password
    } 
    const result = await client.query('SELECT * FROM kullanici WHERE "email" = $1 AND "password"=$2 ', [formData.email, formData.password])
  if(result.rows.length > 0) {
    const result2 = await client.query('SELECT "id" FROM kullanici WHERE  "email" = $1', [formData.email])
    const userID = result2.rows[0].id;
  
  req.session.email = formData.email;
  req.session.userID = userID
 
  
  res.render("index")
  }else {
    res.render("index", {errorMessage: "Kullanici Adi veya Şifre Hatalı"})
  }
  } catch(error) {
    console.error("Giriş işlemi sırasında bir hata oluştu", error)
    res.send("hata")
  }
})

const getUserData = async (sessionuserId) => {
  try {
    const result2 = await client.query('SELECT "username" FROM kullanici WHERE "id" = $1', [sessionuserId]);
    if (result2.rows.length > 0) {
      const username = result2.rows[0].username;
      
      return [username];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
    throw error; 
  }
}
const getAllUserData = async (sessionuserId) => {
  try {
    const result2 = await client.query('SELECT * from kullanici WHERE "id" = $1', [sessionuserId]);
    if (result2.rows.length > 0) {
      return result2.rows[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Verileri getirirken bir hata oluştu", error);
    throw error;
  }
};


app.get("/changeHeader", async (req, res)  => {

const userSession = req.session;

if (!userSession.email) { 
    res.render("partials/header");
} else {
    try {
     
        const userData = await getUserData(userSession.userID);
        
        if (userData) {
            const [username] = userData;
            res.render("partials/loginheader", {
                username: username,
               
            });
        } else {
            res.send("Bir hata Oluştu!");
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.send("hataaaa");
    }
}
})


app.get("/logout", (req,res) => {
  req.session.destroy()
  res.set('Set-Cookie', `session=; expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  res.render("index")
})

app.get('/restoranlar', async (req, res) => {
  const restaurantId = req.query.id;
  
  if (!req.session.userID) { 
    return res.render("partials/loginalert")
}
  if (restaurantId) {
    try {
      const result = await client.query('SELECT * FROM restoranlar WHERE restoranid = $1', [restaurantId]);
      const menuResult = await client.query('SELECT * FROM menuler WHERE restoranID = $1', [restaurantId]);

      if (result.rows.length > 0) {
        const restaurant = result.rows[0];
        const userID = req.session.userID
        restaurant.menu = menuResult.rows.map(item => ({
          name : item.yemekad,
          price : item.yemekfiyat
        }))
        res.render('restoranDetay', { restaurant, userID });
      } else {
        res.status(404).send('Restoran bulunamadı.');
      }
    } catch (err) {
      console.error('Veritabanı hatası:', err);
      res.status(500).send('Sunucu hatası.');
    }
  } else {
    
    res.render('restoranlar');
  }
});

app.get('/api/restoranlar', async (req, res) => {
  try {
      const result = await client.query('SELECT restoranid as id, restoranad AS name, restoranadres AS address, restorankoordinat AS coordinates, restorantype AS type, restoranimg as img FROM restoranlar');
      const restoranlar = result.rows.map(row => {
          const [lat, lng] = row.coordinates.split(',').map(coord => parseFloat(coord.trim()));
          return { name: row.name, address: row.address, lat, lng, type : row.type, img : row.img, id:row.id };
      });
      res.json(restoranlar);
  } catch (err) {
      console.error('Error fetching restaurant data:', err);
      res.status(500).send('Server error');
  }
});



/* app.post('/kaydet', (req, res) => {
  const { restoranID,numberOfPeople,
    reservationTarihi,
    selectedChairs,
    reservationZamani ,
    masano } = req.body

 
  const query = 'INSERT INTO rezervasyonlar(restoranid, rezervasyontarih, rezervasyonsaat, masaid, kisisayisi) VALUES ($1, $2, $3, $4, $5)';
  const values = [restoranID,  reservationTarihi,reservationZamani, masano,numberOfPeople ];

  client.query(query, values, (error, result) => {
      if (error) {
          res.status(500).send('Rezervasyon kaydedilemedi.');
      } else {
          res.status(200).send('Rezervasyon başarıyla kaydedildi.');
      }
  });
}); */

//******************************************
app.post('/kaydet', async (req, res) => {
  const { restoranID, numberOfPeople, reservationTarihi, selectedChairs, reservationZamani, masano } = req.body;
  const userID = req.session.userID;
  console.log(selectedChairs);
  try {
     
      const checkQuery = `
          SELECT * FROM rezervasyonlar 
          WHERE restoranid = $1  
          AND masaid = $2
          AND kisisayisi= $3
      `;
      const checkValues = [restoranID, masano,  numberOfPeople,];
      const checkResult = await client.query(checkQuery, checkValues);
      console.log("Satır sayısı :",checkResult.rows.length);
      if (checkResult.rows.length > 0) {
          res.status(400).send('Seçilen masa ve saat için zaten bir rezervasyon var.');
      } else {
     
          const insertQuery = `
              INSERT INTO rezervasyonlar(restoranid, rezervasyontarih, rezervasyonsaat, masaid, kisisayisi, kisiid) 
              VALUES ($1, $2, $3, $4, $5, $6)
          `;
          const insertValues = [restoranID, reservationTarihi, reservationZamani, masano, numberOfPeople, userID];
          await client.query(insertQuery, insertValues);

          
          res.status(200).send('Rezervasyon başarıyla kaydedildi.');
      }
  } catch (error) {
     
     
      res.status(500).send('Rezervasyon kaydedilemedi.');
  } 
});

app.get('/api/reservations/:restoranID/:masano', async (req, res) => {
  const { restoranID, masano } = req.params;

  try {
      const query = `
          SELECT * FROM rezervasyonlar
          WHERE restoranid = $1
          AND masaid = $2
      `;
      const values = [restoranID, masano];
      const result = await client.query(query, values);

     
      res.json(result.rows);
  } catch (error) {
      console.error('Rezervasyonlar getirilemedi:', error);
      res.status(500).send('Rezervasyonlar getirilemedi.');
  }
});

//******************************************

app.get("/profile", async (req, res) => {
  const userSession = req.session;

  if (!userSession.email) { 
    res.render("partials/header");
  } else {
    try {
      const userData = await getAllUserData(userSession.userID);
      
      
      if (userData) {
        const { email, username, password } = userData;
        res.render("profile", {
          email: email,  
          username: username,
          password: password
        });
      } else {
        res.send("Bir hata Oluştu!");
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.send("hataaaa");
    }
  }
});

app.post('/update-profile', (req, res) => {
  let { username, email, password} = req.body;
  
  const userID = req.session.userID; 



 
  const sql = 'UPDATE kullanici SET "username" = $1, "email"=$2, "password"=$3  WHERE "id" = $4';
  const values = [username, email, password, userID];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.error('Profil güncellenirken hata oluştu:', err);
      return res.status(500).json({ success: false, message: 'Profil güncellenirken bir hata oluştu' });
    }
    res.json({ success: true, message: 'Profil başarıyla güncellendi' });
  });
});

app.get("/favlocation", async (req, res) => {
  try 
  {
    const userSession = req.session
    
    
    const userFavLocation = await getUserFavoriteLocations(userSession.userID)
    
    
    if(userFavLocation) {
    res.render("favlocation", 
      {
        userData : userFavLocation,
        userID : req.session.userID
        
      }
    )
  }
  }
  catch(error)
  {
    console.error("Kullanıcı bilgilerini getirirken hata oluştu", error);
    
  }
  
  
})

app.post("/api/updatefav", async (req,res) => {
 const {userID, locationID} = req.body;

 try {
  await updateUserFavoriteLocations(userID, locationID);
  res.status(200).json({message : "Favori başarıyla güncellendi"});
 }catch(e)
 {
  console.error("Error favoriler güncellenirken bir hata oldu", e);
  res.status(500).json({message : "Favoriler güncellenirken bir hata oldu"})
 }

})

app.post("/api/favorites", async (req,res) => {
  const userID = req.session.userID;
  try {
    const data = await getUserFavoriteLocations(userID);
    res.json(data);
  } catch(error)
  {
    console.error("Error fetching favorite locations :  ", error);
    res.status(500).json({message : "Server error"})
  }
})

const getUserFavoriteLocations = async function(userID) {
  const query = `
  SELECT restoranlar.*
  FROM restoranlar 
  INNER JOIN kullanici ON restoranlar."restoranid" = ANY(kullanici."favlocation") 
  WHERE kullanici."id" = $1;
`;

 var result = await client.query(query, [userID]);

if (result.rows.length > 0) {

  return result.rows;
} else {
  return [];
}
}

const updateUserFavoriteLocations = async function(userID, locationID) {
  const query = `UPDATE kullanici
  SET "favlocation" = CASE
      WHEN $2 = ANY("favlocation")
      THEN array_remove("favlocation", $2)
      ELSE array_append("favlocation", $2)
   END
   WHERE "id" = $1;`
   try {
    var result=await client.query(query, [userID, locationID]);
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
} 

app.get('/yorumlarim', async (req, res) => {
  const restaurantId = req.query.id;
  
  if (!req.session.userID) { 
    return res.render("partials/loginalert")
}
  if (restaurantId) {
    try {
      const result = await client.query('SELECT * FROM restoranlar WHERE restoranid = $1', [restaurantId]);
     
      if (result.rows.length > 0) {
        const restaurant = result.rows[0];
        const userID = req.session.userID
       
        res.render('yorumlarim', { restaurant, userID });
      } else {
        res.status(404).send('Restoran bulunamadı.');
      }
    } catch (err) {
      console.error('Veritabanı hatası:', err);
      res.status(500).send('Sunucu hatası.');
    }
  } else {
    
    res.render('yorumlarim');
  }
});

app.post("/yorum-ekle", async (req,res) => {
  const {restoranid,  puan, yorum} = req.body;
 const  kullaniciid =  req.session.userID;

  try 
  {
    await client.query("INSERT INTO yorumlar (restoranid, kullaniciid, puan, yorum) VALUES ($1, $2, $3, $4)", [restoranid, kullaniciid, puan, yorum]);
    res.redirect("/");
  }catch(e)
  {
    console.error(e);
    res.status(500).send("Sunucu hatası");
  }
});

app.get("/yorumlar", async (req,res) => {
  const kullaniciid = req.session.userID;

  if(!kullaniciid) {
    return res.status(401).send("giriş yapmamız gerekiyor");

  }

  try {
    const result = await client.query("SELECT y.yorumlarid, y.restoranid, y.kullaniciid, y.puan, y.yorum, r.restoranimg FROM yorumlar y JOIN restoranlar r ON y.restoranid = r.restoranid WHERE y.kullaniciid= $1 ", [kullaniciid]);
    const yorumlar = result.rows;
   
    
    res.render("yorumlar", {yorumlar});
    
  }catch(e)
  {
    console.error("Error getching comments", e);
    res.status(500).send("Sunucu hatası");
  }
})

app.get('/yorumlarim', async (req, res) => {
  const userId = req.session.user.id;
  const query = `
      SELECT y.yorumlarid, y.restoranid, y.kullaniciid, y.puan, y.yorum, r.restoranimg 
      FROM yorumlar y
      JOIN restoranlar r ON y.restoranid = r.restoranid
      WHERE y.kullaniciid = $1
  `;
  const values = [userId];
  try {
      const result = await db.query(query, values);
      res.render('yorumlarim', { yorumlar: result.rows });
  } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
  }
});


hbs.registerHelper('range', function(start, end) {
  let result = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
});

hbs.registerHelper('lte', function(a, b) {
  return a <= b;
});

hbs.registerHelper('add', function(a, b) {
  return a + b;
});

/* app.get('/restorandetay/:id', async (req, res) => {
  const restoranID = req.params.id;
  const userID = req.session.userID; 

  try {
      const restoran = await getRestoranByID(restoranID);
      const menu = await getMenuByRestoranID(restoranID);
      const reservations = await getReservationsByRestoranID(restoranID); 

      res.render('restorandetay', {
          restaurant: { ...restoran, menu },
          reservations,
          userID
      });
  } catch (error) {
      console.error('Hata:', error);
      res.status(500).send('Bir hata meydana geldi');
  }
});
 */

app.post('/reservation-status', (req, res) => {
  const { restoranID, reservationTarihi, reservationZamani } = req.body;
  
  const query = 'SELECT masaid, kisisayisi FROM rezervasyonlar WHERE restoranid = $1 AND rezervasyontarih = $2 AND rezervasyonsaat = $3';
  const values = [restoranID, reservationTarihi, reservationZamani];

  client.query(query, values, (error, result) => {
    if (error) {
      res.status(500).send('Rezervasyon durumu alınamadı.');
    } else {
      res.status(200).json(result.rows);
    }
  });
});



  app.get('/rezervasyonlar', async (req, res) => {
    const userID = req.session.userID;
    try {
        const result = await client.query('SELECT * FROM rezervasyonlar WHERE kisiid = $1', [userID]);
        res.render('rezervasyonlar', { reservations: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});


app.post('/rezervasyonlar/sil/:id', async (req, res) => {
    const reservationId = req.params.id;
    try {
        await client.query('DELETE FROM rezervasyonlar WHERE rezervasyonid = $1', [reservationId]);
        res.redirect('/rezervasyonlar');
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});






module.exports = app




