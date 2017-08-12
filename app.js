var five = require("johnny-five"),
    Raspi = require("raspi-io"),
    Picam = require("raspicam"),
    fs = require('fs'),
    shell = require("shelljs")
    path = require('path'),
    countFiles = require("count-files");

//Led colors
var colorBlue = "#0600c9", colorRed = "#fe0000"
// Check if camera is not being run
var pid = shell.exec("ps -C raspistill -o pid=", { silent:true }).stdout
var ip = shell.exec("ifconfig | awk \'/inet addr/{if(substr($2,6)!= \"1.0.0.1\"&&substr($2,6) != \"127.0.0.1\"){ print substr($2,6)}}\'",{silent:true}).stdout
if(pid){
  console.log("Camera is still being used, killing it!");
  shell.exec("kill "+pid, { silent:true })
}

var app = require('express')(),
    express = require('express'),
    server = require('http').Server(app),
    io = require('socket.io', { rememberTransport: false, transports: ['WebSocket', 'Flash Socket', 'AJAX long-polling'] })(server);

// Server setup
server.listen(80);
app.use("/",express.static(path.join(__dirname, 'public')));
app.use("/data", express.static(path.join(__dirname, '/data')));
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                                  Socket.IO                                  ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
io.on('connection', function(socket){
  // Start steaming
  displayConnected()
  socket.on('disconnect', function() {
    displayConnected()
  });
});
function displayConnected() {
  saveDisplay();
  lcd.clear().cursor(1,3).print("Connected: "+io.engine.clientsCount)
  setTimeout(function(){
    menuScroll("",lcd,cur,true)
    if(menuHight == "opt" || menuHight == "optList"){
      console.log("has optfunc");
      if(cur.optFunc && mode !== "timelapse"){
        cur.optFunc(lcd)
      }
    }else if(menuHight == "sub")
    console.log(mode);
    if(cur.subFunc && mode !== "timelapse"){
      cur.subFunc(lcd)
    }
  },2000)
}
function sendLastPic(curPath) {
  if(curPath){
    fs.readFile(curPath,function(err, buffer){
      console.log("Last pic send");
      io.sockets.emit("lastPic", buffer.toString("base64"))
    })
  }
}
function sendTimekey(timePath,localPath,done){
  if(done){
    io.sockets.emit("timeKey",false)
  }else{
    fs.readdir(timePath,(err, files)=>{
      if(path.extname(files[files.length-1]) == ".jpg"){
        io.sockets.emit("timeKey",localPath+"/"+files[files.length-1]);
      }
    });
  }
}
function random(intergers){
  if(!isNaN(intergers)){
    var r = Math.random()
    r = Math.floor(r * Math.pow(10, intergers))
    return r
  }
}
function webRefresh(){
  io.sockets.emit("refresh",true)
}
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                                 Gallery                                     ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
function getPictures(req, res) {
  var list = [], i = 0
  fs.readdir(path.join(__dirname, 'data/photos'), (err, files) => {
    files.forEach(file => {
      list[i] = file;
      i += 1
    });
    res.json({list})
  })
}
app.get("/pictures",getPictures)

function getGifs(req,res){
  var list = [], i = 0;
  fs.readdir(path.join(__dirname, 'data/gif'), (err, files) => {
    files.forEach(file => {
      if(path.extname(file) == ".gif"){
        list[i] = file;
        i += 1
      }
    });
    res.json({list})
  });
}
app.get("/gifs",getGifs)
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                                 Hardware                                    ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
var lcd,LED
var board = new five.Board({
      io: new Raspi()
});
board.on("ready", function() {
  LED = new five.Led.RGB({
    pins: [26, 23, 24]
  });
  var buttonA = new five.Button(0);
  buttonA.on("press", function() {
    input(lcd,"A")
  });

  var buttonB = new five.Button(2);
  buttonB.on("press", function() {
    input(lcd,"B")
  });

  var buttonC = new five.Button(3);
  buttonC.on("press", function() {
    input(lcd,"C")
  });
  var buttonD = new five.Button(1);
  buttonD.on("press", function() {
    input(lcd,"D")
  });

  lcd = new five.LCD({
    controller: "PCF8574A",
    rows: 4,
    cols: 20
  });

  lcd.clear().noBlink()
  lcd.useChar("pointerup").useChar("pointerdown").useChar("fullprogress").useChar("pointerright").useChar("back");
  LED.color(colorBlue);
  LED.intensity(100);
  if(ip){
    lcd.cursor(2,3).print(ip)
  }
  setTimeout(()=>{
    menu(lcd,"")
  },2000)

});
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                               CAMERA MODES                                  ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
function getDate() {
  var d = new Date(),
      months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug", "Sep","Oct","Nov","Dec"];
  var dateNow = d.getDate()+"-"+months[d.getMonth()]+"-"+d.getFullYear()+"_"+d.getHours()+":"+d.getMinutes()
  return dateNow
}
var settings = {
  "sh" : function(){return findObjByAttr(subMenu[4],"name","Sharpness").val},
  "co" : function(){return findObjByAttr(subMenu[4],"name","Contrast").val},
  "br" : function(){return findObjByAttr(subMenu[4],"name","Brightness").val},
  "sa" : function(){return findObjByAttr(subMenu[4],"name","Saturation").val},
  "iso": function(){return findObjByAttr(subMenu[4],"name","ISO").val},
  "ev": function(){return findObjByAttr(subMenu[4],"name","EV").val},
  "ex": function(){var obj = findObjByAttr(subMenu[4],"name","Ex mode"); return obj.options[obj.val]},
  "awb": function(){var obj = findObjByAttr(subMenu[4],"name","AWB"); return obj.options[obj.val]},
  "ifx": function(){var obj = findObjByAttr(subMenu[4],"name","Img fx"); return obj.options[obj.val]},
  "rot": function(){return findObjByAttr(subMenu[4],"name","Rotation").val}
}
var cameraTimelapse
function timelapse(start,lcd){
  if(start){
    var delay = Math.round(findObjByAttr(subMenu[0],"name","Delay").val * 1000),
        dur = Math.round(findObjByAttr(subMenu[0],"name","Duration").val * 60000),
        encodingObj = findObjByAttr(subMenu[0],"name","Encoding"),
        encoding = encodingObj.options[encodingObj.val],
        localPath = "data/timelapse/"+getDate();
        timePath = path.join(__dirname,"/"+localPath),
        totalAmountPic = (dur/1000) / (delay/1000) + 1

    cameraTimelapse = new Picam({
      "mode":"timelapse",
      "output": timePath+"/%04d."+encoding,
      "w":1920,
      "h":1080,
      "q":100,
      "t":dur,
      "e":encoding,
      "tl": delay,
      "sh": settings.sh(),
      "co": settings.co(),
      "br": settings.br(),
      "sa": settings.sa(),
      "ISO": settings.iso(),
      "ev": settings.ev(),
      "ex": settings.ex(),
      "awb": settings.awb(),
      "ifx": settings.ifx(),
      "rot": settings.rot()
    })
  cameraTimelapse.start();
  timelapseStatusOn = true
  console.log("Timelapse started");
  mode = "timelapse"
  }else if(!start){
    sendTimekey("","",true)
    cameraTimelapse.stop();
    console.log("Timelapse Stopped");
  }
  var i = 0
  cameraTimelapse.on("read",function(err,filename) {
      if(err) throw err
      if(i > 1){
        sendTimekey(timePath,localPath);
        i = 0
      }else{
        i+=1
      }
      timelapseDisplay(lcd,timePath, totalAmountPic)
  })
}
var count = 0
function singlePicture(){
  var encodingObj = findObjByAttr(subMenu[1],"name","Encoding"),
      encoding = encodingObj.options[encodingObj.val],
      singlePath = path.join(__dirname,"/data/photos/-"+getDate()+"_"+count+"."+encoding);
  var singleCam = new Picam({
    "mode":"photo",
    "output": singlePath,
    "w":1920,
    "h":1080,
    "q":100,
    "t":250,
    "e":encoding,
    "sh": settings.sh(),
    "co": settings.co(),
    "br": settings.br(),
    "sa": settings.sa(),
    "ISO": settings.iso(),
    "ev": settings.ev(),
    "ex": settings.ex(),
    "awb": settings.awb(),
    "ifx": settings.ifx(),
    "rot": settings.rot()
  })
  singleCam.start()
  singleCam.on("exit",()=>{
    sendLastPic(singlePath);
    webRefresh()
  })
  count += 1
}

function gifMaker(start){
  if(start){
    var duration = findObjByAttr(subMenu[2],"name","Duration").val,
        pathGif = path.join(__dirname,"/data/gif/temp");
    var gifCam = new Picam({
      "mode":"timelapse",
      "output": pathGif+"/"+random(5)+"--%04d.jpg",
      "w":540,
      "h":405,
      "q":100,
      "t": duration,
      "tl":500,
      "e":"jpg",
      "sh": settings.sh(),
      "co": settings.co(),
      "br": settings.br(),
      "sa": settings.sa(),
      "ISO": settings.iso(),
      "ev": settings.ev(),
      "ex": settings.ex(),
      "awb": settings.awb(),
      "ifx": settings.ifx(),
      "rot": settings.rot()
    })
    gifCam.start()
    gifStatus()
    gifCam.on("exit", ()=>{
      renderGif()
    })
  }else if(!start){
    if(gifCam){
      console.log("Gif stopped");
      gifCam.stop()
    }
  }
}
function renderGif() {
  console.log("Going to renderGIF");
  var gifPath = path.join(__dirname,"/data/gif")
  loading(false)
  loading(true,"Rendering GIF","May take long")
  shell.exec("convert -delay 15 -loop 0 "+gifPath+"/temp/*.jpg "+gifPath+"/"+getDate()+".gif", { silent:true, ascync: true },function(){
    console.log("Gif is ready!");
    shell.exec("rm "+gifPath+"/temp/* -rf",function(){
      webRefresh()
      loading(false)
      menu(lcd,"",true)
    })
  })
}
function gifStatus(){
  loading(true,"Filming gif")
}
function loading(start,string,stringTwo){
  if(start){
    lcd.clear().cursor(0,1).print(string);
    if(stringTwo){
      lcd.cursor(1,1).print(stringTwo)
    }
    var ledStatus = true
    ledBlink = setInterval(()=>{
      if(ledStatus){
        LED.color(colorRed);
        LED.intensity(100);
        ledStatus = false
      }else{
        LED.color(colorRed);
        LED.intensity(10);
        ledStatus = true
      }

    },1000)
    loadingInterval = setInterval(()=>{
      if(i > 0){
        lcd.cursor(2,i-1).print(" ")
      }else{
        lcd.cursor(2,20).print(" ")
      }
      lcd.cursor(2,i).print(":fullprogress:")
      i += 1
      if(i>20){
        i = 0
      }
    },400)
  }else if(!start){
    if(loadingInterval){
      LED.color(colorBlue);
      clearInterval(ledBlink)
      clearInterval(loadingInterval)
    }
  }
}
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                             INPUT HANDLER                                   ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
var mode = "menu"
function input(lcd, input){
  switch (mode) {
    case "menu":
      menu(lcd,input)
      break;
    case "timelapse":
      timelapseStatus(lcd,input)
      break;
    case "single":
      singleHandler(lcd, input)
      break;
    case "gif":
      gifHandler(lcd,input)
      break;
    default:
    console.log("Mode is not set");
  }
}
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                             TIMELAPSE STATUS                                ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
function timelapseStatus(lcd, input){
  switch (input) {
    case "C":
      console.log("Stopping time lapse");
      timelapse(false,lcd)
      menu(lcd,"",true)
      break;
    default:
  }
}
function timelapseDisplay(lcd,pathTime,calcTotal){
  countFiles(pathTime, function (err, results) {
    var size = Math.round(results.bytes/1048576);
    lcd.clear().cursor(0,0).print(results.files+"/"+calcTotal+" Photos");
    lcd.cursor(1,0).print(size+" MB")
    if(results.files == calcTotal){
      sendTimekey("","",true)
      lcd.clear().cursor(0,0).print("Timelapse done");
    }
  })
}
function singleHandler(lcd, input) {
  switch (input) {
    case "C":
      lcd.home().clear().print("Exiting")
      menu(lcd,"",true)
      break;
    case "D":
      singlePicture()
      loading(true,"Saving.....")
      setTimeout(function(){
        loading(false)
        lcd.clear().cursor(0,0).print("Press top button");
        lcd.cursor(1,0).print("to take a photo");
        lcd.cursor(3,0).print("Or select to cancel")
      },3000)
      break;
    default:

  }
}
function gifHandler(lcd,input){
  switch (input) {
    case "C":
      gifMaker(false)
      loading(false)
      menu(lcd,"",true)
      break;
    default:

  }
}
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                             MENU DECLARATION                                ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
var mainMenu = [
  {"name":"Timelapse"},
  {"name":"Single picture"},
  {"name":"Animated GIF"},
  {"name":"Movie"},
  {"name":"Settings"},
  0],
  backMenuItem = {
    "name": "Back :back:",
    "type": "back",
    "subFunc": function(lcd){
      parent[parent.length - 1] = 0
      cur = mainMenu;
      menuHight = "top"
      menuScroll("",lcd,cur,true,"main");
      return false
    },
  },
  subMenu = [
    //Timelapse
    [
      backMenuItem,
      {
        "name": "Start",
        "subFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Timelapse setup...");
          timelapse(true,lcd);
        }
      },
      {
        "name": "Delay",
        "type": "number",
        "unit": "Seconds",
        "val": 4,
        "step": 1,
        "min":4,
        "optFunc": function(lcd,onlyreturn){
          var delayTime = Math.round(60/this.val*60/30)
          if(onlyreturn){
            return delayTime
          }
          if(lcd){
            lcd.cursor(0,0).print(this.name + ":");
            lcd.cursor(1,1).print(this.val + " " + this.unit);
            lcd.cursor(2,0).print("Speed:");
            lcd.cursor(3,1).print(delayTime + " Sec/Hour")
          }
        }
      },
      {
        "name": "Duration",
        "type":"number",
        "unit": "Minutes",
        "val": 10,
        "step": 2,
        "min": 0,
        "optFunc": function(lcd,onlyreturn){
          var totalTime = Math.round(this.val / 60 * findObjByAttr(subMenu[0],"name","Delay").optFunc("",true))
          if(onlyreturn){
            return totalTime
          }
          if(lcd){
            lcd.cursor(0,0).print(this.name+ ":");
            lcd.cursor(1,1).print(this.val + " " + this.unit);
            lcd.cursor(2,0).print("Final:");
            lcd.cursor(3,1).print(totalTime +" Seconds")
          }
        }
      },
      {
        "name": "Encoding",
        "type": "list",
        "val": 0,
        "options":["jpg","png","bmp","gif"],
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Encoding: ."+this.options[this.val]);
          lcd.cursor(1,0).print("Scroll to change");
          lcd.cursor(2,1).print(":pointerup:");
          lcd.cursor(3,1).print(":pointerdown:")
        }
      },
      0
    ],
    //Photo
    [
      backMenuItem,
      {
        "name": "Start",
        "subFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Press top button");
          lcd.cursor(1,0).print("to take a photo")
          lcd.cursor(3,0).print("Or select to cancel")
          mode = "single"
        }
      },
      {
        "name": "Encoding",
        "type": "list",
        "val": 0,
        "options":["jpg","png","bmp","gif"],
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Encoding: ."+this.options[this.val]);
          lcd.cursor(1,0).print("Scroll to change")
          lcd.cursor(2,1).print(":pointerup:");
          lcd.cursor(3,1).print(":pointerdown:")
        }
      },
      {
        "name": "Settings",
        "subFunc": function(lcd){
          cur = subMenu[4]
          menuScroll("",lcd,cur)
        }
      },
      0
    ],
    //GIF
    [
      backMenuItem,
      {
        "name": "Start",
        "subFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Filming");
          gifMaker(true)
          mode = "gif"
        }
      },
      {
        "name": "Duration",
        "type": "number",
        "unit": "MiliSeconds",
        "val": 4000,
        "min":1000,
        "step":1000,
        "optFunc": function(){
            lcd.clear().cursor(0,0).print(this.name + ":");
            lcd.cursor(1,1).print(this.val + " "+this.unit);
            lcd.cursor(2,0).print("Duration of");
            lcd.cursor(3,0).print("captured time.")
        }
      },
      {
        "name": "Settings",
        "subFunc": function(lcd){
          cur = subMenu[4];
          menuScroll("",lcd,cur)
        }
      },
      0
    ],
    //Movie
    [],
    //Settings
    [
      backMenuItem,
      {
        "name": "ISO",
        "type": "number",
        "val": 100,
        "step": 100,
        "min": 100,
        "max": 800,
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print(this.name + ":" + this.val);
          lcd.cursor(1,0).print("100 to 800")
        }
      },
      {
        "name": "Brightness",
        "type": "number",
        "val": 50,
        "step": 5,
        "min": 0,
        "max": 100,
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print(this.name + ":" + this.val);
          lcd.cursor(1,0).print("0 to 100")
        }
      },
      {
        "name": "EV",
        "type": "number",
        "val": 0,
        "step": 1,
        "min": -10,
        "max": 10,
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print(this.name + ":" + this.val);
          lcd.cursor(1,0).print("-10 to 10")
        }
      },
      {
        "name": "Ex mode",
        "type": "list",
        "val": 0,
        "options":["auto","off","night","nightpreview","backlight","spotlight","sports","snow","beach","verylong","fixedfps","antishake","fireworks"],
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Mode: "+this.options[this.val]);
          lcd.cursor(1,0).print("Scroll to change");
          lcd.cursor(2,1).print(":pointerup:");
          lcd.cursor(3,1).print(":pointerdown:")
        }
      },
      {
        "name": "AWB",
        "type": "list",
        "val": 0,
        "options":["auto","off","sun","cloud","shade","tungsten","fluorescent","incandescent","flash","horizon"],
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Mode: "+this.options[this.val]);
          lcd.cursor(1,0).print("Scroll to change");
          lcd.cursor(2,1).print(":pointerup:");
          lcd.cursor(3,1).print(":pointerdown:")
        }
      },
      {
        "name": "Img fx",
        "type": "list",
        "val": 0,
        "options":["none","negative","solarise","sketch","denoise","emboss","oilpaint","hatch","gpen","pastel","watercolour","film","blur","saturation",
          "colourswap","washedout","posterise","colourpoint","colourbalance","cartoon"],
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Effect: ");
          lcd.cursor(1,0).print(this.options[this.val]);
          lcd.cursor(2,1).print(":pointerup:");
          lcd.cursor(3,1).print(":pointerdown:")
        }
      },
      {
        "name": "Sharpness",
        "type": "number",
        "val": 0,
        "step": 5,
        "min": -100,
        "max": 100,
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print(this.name + ":" + this.val);
          lcd.cursor(1,0).print("-100 to 100")
        }
      },
      {
        "name": "Contrast",
        "type": "number",
        "val": 0,
        "step": 5,
        "min": -100,
        "max": 100,
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print(this.name + ":" + this.val);
          lcd.cursor(1,0).print("-100 to 100")
        }
      },
      {
        "name": "Saturation",
        "type": "number",
        "val": 0,
        "step": 5,
        "min": -100,
        "max": 100,
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print(this.name + ":" + this.val);
          lcd.cursor(1,0).print("-100 to 100")
        }
      },
      {
        "name": "Rotation",
        "type": "number",
        "val": 180,
        "step": 45,
        "min": 0,
        "max": 359,
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print(this.name + ":" + this.val);
          lcd.cursor(1,0).print("0 to 359")
        }
      },
      0
    ]
  ]

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                                  MENU                                       ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
var cur,parent,menuHight = "top"
function menu(lcd,button,reset){
  LED.color(colorBlue)
  if(reset){
    mode = "menu"
    menuHight="top"
    cur = mainMenu
    cur[cur.length-1] = 0
    menuScroll("",lcd,cur,true)
  }
  if(!cur){
    cur = mainMenu
    menuScroll("",lcd,cur,true)
  }
//〚 ______________________ Main MENU ______________________ 〛
  if(menuHight == "top"){
    if(button == "A"){
      menuScroll("up",lcd,cur)
    }else if(button =="B"){
      menuScroll("down",lcd,cur)
    }else if(button == "C"){
      parent = cur
      lineNumber = cur[cur.length-1]
      saveDisplay("main")
      if(subMenu[lineNumber]){
        cur = subMenu[lineNumber];
        menuScroll("",lcd,cur,true);
        menuHight = "sub"
      }
    }
//〚 ______________________ SUB MENU ______________________ 〛
/*
backMenuItem = {
  "name": "Back :back:",
  "type": "back",
  "subFunc": function(lcd){
    parent[parent.length - 1] = 0
    cur = mainMenu;
    menuHight = "top"
    menuScroll("",lcd,cur,true,"main");
    return false
  },

*/
  }else if(menuHight == "sub"){
    if(button == "A"){
      menuScroll("up",lcd,cur)
    }else if(button == "B"){
      menuScroll("down",lcd,cur)
    }else if(button == "C"){
      parent = cur
      cur = cur[cur[cur.length-1]]
      saveDisplay()
      if (cur.subFunc){
        var more = cur.subFunc(lcd)
        console.log(more);
      }else{

      }
      if(more || !cur.subFunc){
        if(cur.type == "number"){
          valNumber(cur,lcd);
          menuHight = "opt"
        }else if(cur.type == "list"){
          list(lcd,cur);
          menuHight = "optList"
        }
      }
    }
  }else if(menuHight == "opt"){
    if(cur.step) var step = cur.step
    if(button == "A"){
      valNumber(cur,lcd,"up",step)
    }else if(button =="B"){
      valNumber(cur,lcd,"down",step)
    }else if(button == "C"){
      cur = parent
      menuScroll("",lcd,cur,true,true)
      menuHight = "sub"
    }
  }else if(menuHight == "optList"){
    if(button == "A"){
      list(lcd,cur,"up")
    }else if(button =="B"){
      list(lcd,cur,"down")
    }else if(button == "C"){
      cur = parent
      menuScroll("",lcd,cur,true,true)
      menuHight = "sub"
    }
  }
}
var displayBlock = [0],
    full = 0,
    selected
function menuScroll(direction, lcd, curMenu,reset,backup){
  //reset
  if(reset){
    displayBlock = [0];
    full = 0;
    selected = 0;
  }
  //Reload parent setting
  if(backup){
    if(backup !== "main"){
      console.log("Loading backup");
      full = prev.full;
      selected = prev.selected
      displayBlock = prev.displayBlock
    }else{
      console.log("Loading MAIN backup");
      full = prevMain.full;
      selected = prevMain.selected
      displayBlock = prevMain.displayBlock
    }
  }
  //Error check
  if(!lcd || !curMenu){
    console.log("ERROR PARAMETER NOT DECLARED");
    return
  }
  // Making a displayBlock
  for(i=0;i<curMenu.length-1;i++){
    displayBlock[i+1] = curMenu[i]
  }
  if(direction == "up"){
    if(selected > 0){
      selected -= 1
    }else{
      if(full > 0){
        full -= 1
      }else{
        var skipped = Math.floor((displayBlock.length-1)/4 - 1)*4,
            remaining = (displayBlock.length-1)%4
        full = skipped+remaining;
        selected = 3
      }
    }
    if(displayBlock[0] > 0){
      displayBlock[0] -= 1
    }else{
      displayBlock[0] = displayBlock.length - 2
    }
  }else if(direction == "down"){
    if(selected < 3){
      selected += 1
    }else{
      if(full < displayBlock.length - 5){
        full += 1
      }else{
        full = 0;
        selected = 0
      }
    }
    if(displayBlock[0] < displayBlock.length - 2){
      displayBlock[0] += 1
    }else{
      displayBlock[0] = 0
    }
  }
  // if(displayBlock[0] >= displayBlock.length){
  //   displayBlock[0] -= 1
  // }
  lcd.clear()
  for(i=1+full;i<5+full && i<displayBlock.length;i++) {
    displaythis(displayBlock[i],i-1-full,selected)
  }
  function displaythis(line,list,select) {
    if(list == select){
      if(line.options){
        lcd.cursor(list,0).print(":pointerright:"+line.name +":"+line.options[line.val]);
      }else if(line.val || line.val == 0){
        if(line.unit){
          lcd.cursor(list,0).print(":pointerright:"+line.name +":"+line.val+line.unit.substring(0,3));
        }else{
          lcd.cursor(list,0).print(":pointerright:"+line.name +":"+line.val);
        }
      }else{
        lcd.cursor(list,0).print(":pointerright:"+line.name);
      }
    }
    if(line.options){
      lcd.cursor(list,1).print(line.name +":"+line.options[line.val]);
    }else if(line.val || line.val == 0){
      if(line.unit){
        lcd.cursor(list,1).print(line.name +":"+line.val+line.unit.substring(0,3));
      }else{
        lcd.cursor(list,1).print(line.name +":"+line.val);
      }
    }else{
      lcd.cursor(list,1).print(line.name);
    }
  }
  curMenu[curMenu.length-1] = displayBlock[0]
}

// FUNCTIONS

function saveDisplay(opt){
  if(!opt){
    prev = {
      "full" : full,
      "selected" : selected,
      "displayBlock" : displayBlock
    }
  }else if(opt == "main"){
    prevMain = {
      "full" : full,
      "selected" : selected,
      "displayBlock" : displayBlock
    }
  }
}

function valNumber(cur,lcd,direction, amount){
  if(!amount) amount = 1
  var val = cur.val
  if(direction == "up") val += amount
  if(direction == "down") val -= amount
  if(val < cur.min) val = cur.min
  if(val > cur.max) val = cur.max
  cur.val = val
  lcd.clear()
  cur.optFunc(lcd)
}
function list(lcd,cur,direction){
  var val = cur.val,
  array = cur.options
  if(direction == "up") val += 1
  if(direction == "down") val -= 1
  if(val > array.length - 1) val = 0
  if(val < 0) val = array.length - 1
  cur.val = val
  cur.optFunc(lcd)
}
function findObjByAttr(array, attr, value) {
  var obj = array.find(x => x[attr] == value);
  if(!obj){
    return false
  }else{
    var index = array.indexOf(obj);
    return array[index]
  }
}
