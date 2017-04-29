var five = require("johnny-five"),
    Raspi = require("raspi-io"),
    Picam = require("raspicam"),
    chokidar = require('chokidar'),
    fs = require('fs'),
    shell = require("shelljs")
    path = require('path'),
    countFiles = require("count-files");

var app = require('express')(),
    express = require('express'),
    server = require('http').Server(app),
    io = require('socket.io', { rememberTransport: false, transports: ['WebSocket', 'Flash Socket', 'AJAX long-polling'] })(server);

var pathImg = path.join(__dirname,"/public/stream/streaming.jpg")
// Server setup
server.listen(80);
app.use(express.static(path.join(__dirname, 'public')));
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                                  STREAMING                                  ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

io.on('connection', function(socket) {
  // Start steaming
  console.log("Connected");
  socket.on('start-stream', function(){
    console.log("Streaming to connection");
    if(!streaming){
      startStreaming()
    }
    setInterval(sendImg,35)
  });
  socket.on("restart-stream", function(){
    stopStreaming()
    setTimeout(startStreaming, 2000)
  })
  socket.on("stop-stream", function(){
    stopStreaming()
  })
  socket.on('disconnect', function() {
    // no more sockets, kill the stream
    if (io.engine.clientsCount == 0) {
      stopStreaming()
    }
  });
});

var streaming = false
function startStreaming() {
  streaming = true;
  stream(true)
}
function stopStreaming() {
  streaming = false;
  stream(false)
}

function sendImg(){
    fs.readFile(pathImg,function(err, buffer){
      io.sockets.emit("liveStream", buffer.toString("base64"))
    })
}
function sendLastPic(path) {
  if(path){
    fs.readFile(path,function(err, buffer){
      console.log("Last pic send");
      io.sockets.emit("lastPic", buffer.toString("base64"))
    })
  }
}

function getDate() {
  var d = new Date(),
      months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug", "Sep","Oct","Nov","Dec"];
  var dateNow = d.getDate()+"-"+months[d.getMonth()]+"-"+d.getFullYear()+"_"+d.getHours()+":"+d.getMinutes()
  return dateNow
}

// Check if camera is not being run
var pid = shell.exec("ps -C raspistill -o pid=", { silent:true }).stdout
if(pid){
  console.log("Camera is still being used killing it!");
  shell.exec("kill "+pid, { silent:true })
}
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                                  INPUT                                      ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
var lcd, cameraStatus
var board = new five.Board({
      io: new Raspi()
});
board.on("ready", function() {

  var buttonA = new five.Button(7);
  buttonA.on("press", function() {
    input(lcd,"A")
  });

  var buttonB = new five.Button(10);
  buttonB.on("press", function() {
    input(lcd,"B")
  });

  var buttonC = new five.Button(11);
  buttonC.on("press", function() {
    input(lcd,"C")
  });
  var buttonD = new five.Button(25);
  buttonD.on("press", function() {
    input(lcd,"D")
  });


  lcd = new five.LCD({
    pins: [0, 2, 3, 4, 5, 6],
    rows: 2,
    cols: 16
  });
  lcd.clear()
  menu(lcd,"")
});
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                               CAMERA MODES                                  ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
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
function stream(start){
    if(!streamCam){
      var streamCam = new Picam({
        "mode":"timelapse",
        "output": pathImg,
        "w":1920,
        "h":1080,
        "q":100,
        "t":0,
        "e":"jpg",
        "tl": 3000,
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
      });
    }
    if(start){
      streamCam.start();
      console.log("Taking pictures");
      cameraStatus = "streaming"
    }else if(!start){
      streamCam.stop();
      console.log("Stop taking pictures");
      io.sockets.emit("streamOffline")
      streamCam = undefined
      cameraStatus = ""
    }
}

function timelapse(start,lcd){
  if(!cameraTimelapse){
    var delay = Math.round(findObjByAttr(subMenu[0],"name","Delay").val * 1000),
        dur = Math.round(findObjByAttr(subMenu[0],"name","Duration").val * 60000),
        encodingObj = findObjByAttr(subMenu[0],"name","Encoding"),
        encoding = encodingObj.options[encodingObj.val],
        date = getDate(),
        timePath = "./timelapse/"+date,
        totalAmountPic = (dur/1000) / (delay/1000) + 1

    var cameraTimelapse = new Picam({
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
  }
  mode = "timelapse"
  if(start){
    if(!cameraStatus == ""){
      stream(false)
    }
    cameraTimelapse.start();
    timelapseStatusOn = true
    console.log("Timelapse started");
    cameraStatus = "timelapsing"
  }else if(!start){
    cameraTimelapse.stop();
    console.log("Timelapse Stopped");
    cameraStatus = ""
  }

  cameraTimelapse.on("read",function(err,filename) {
      if(err) throw err
      timelapseDisplay(lcd,timePath, totalAmountPic)
  })
}
var count = 0
function singlePicture(){
  if(streaming){
    stopStreaming()
  }
  var encodingObj = findObjByAttr(subMenu[1],"name","Encoding"),
      encoding = encodingObj.options[encodingObj.val],
      path = "picture/"+count+"-"+getDate()+"."+encoding
  var singleCam = new Picam({
    "mode":"photo",
    "output": path,
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
  setTimeout(function() {sendLastPic(path)},3000)
  count += 1
}
// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                             INPUT HANDLER                                   ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
var mode = "menu"
function input(lcd, input){
  console.log(input);
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
      lcd.home().clear().print("Stopping timelapse...")
      timelapse(false,lcd)
      menu(lcd,"",true)
      break;
    default:

  }
}
function singleHandler(lcd, input) {
  switch (input) {
    case "C":
      lcd.home().clear().print("Exiting")
      menu(lcd,"",true)
      break;
    case "D":
      singlePicture()
      lcd.home().clear().print("Made a photo")
      setTimeout(function(){
        lcd.clear().cursor(0,0).print("Press top button");
        lcd.cursor(1,0).print("to take a photo")
      },3000)
      break;
    default:

  }
}
function timelapseDisplay(lcd,path, calcTotal){
  countFiles(path, function (err, results) {
    var size = Math.round(results.bytes/1048576);
    lcd.clear().cursor(0,0).print(results.files+"/"+calcTotal+" Photos");
    lcd.cursor(1,0).print(size+" MB")
    if(results.files == calcTotal){
      lcd.clear().cursor(0,0).print("Timelapse done");
      lcd.cursor(1,0).print("Press to render")
    }
  })
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║                             MENU DECLARATION                                ║
// ╚═════════════════════════════════════════════════════════════════════════════╝
var mainMenu = [
  {"name":"Timelapse"},
  {"name":"Single picture"},
  {"name":"Movie"},
  {"name":"3sec GIF"},
  {"name":"Settings"},
  0],

  subMenu = [
    [
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
        "val": 3,
        "step": 1,
        "min":4,
        "optFunc": function(lcd,onlyreturn){
          var delayTime = Math.round(60/this.val*60/30)
          if(onlyreturn){
            return delayTime
          }
          if(lcd){
            lcd.cursor(0,0).print(this.name + ":" + delayTime + "S/H");
            lcd.cursor(1,0).print(this.val + " " + this.unit)
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
            lcd.cursor(0,0).print(this.name + ":" + totalTime + "Sec");
            lcd.cursor(1,0).print(this.val + " " + this.unit)
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
          lcd.cursor(1,0).print("Scroll to change")
        }
      },
      {
        "name": "Back",
        "type": "back",
        "subFunc": function(lcd){
          parent[parent.length - 1] = 0
          cur = mainMenu;
          menuHight = "top"
          menuScroll("",lcd,cur);
          return false
        }
      },
      0
    ],
    [
      {
        "name": "Start",
        "subFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Press top button");
          lcd.cursor(1,0).print("to take a photo")
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
        }
      },
      {
        "name": "Settings",
        "subFunc": function(lcd){
          cur = subMenu[4]
          menuScroll("",lcd,cur)
        }
      },
      {
        "name": "Back",
        "type": "back",
        "subFunc": function(lcd){
          parent[parent.length - 1] = 0
          cur = mainMenu;
          menuHight = "top"
          menuScroll("",lcd,cur);
          return false
        }
      },
      0
    ],
    [],
    [],
    [
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
          lcd.cursor(1,0).print("Scroll to change")
        }
      },
      {
        "name": "AWB",
        "type": "list",
        "val": 0,
        "options":["auto","off","sun","cloud","shade","tungsten","fluorescent","incandescent","flash","horizon"],
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print("Mode: "+this.options[this.val]);
          lcd.cursor(1,0).print("Scroll to change")
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
          lcd.cursor(1,0).print(this.options[this.val])
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
        "val": 0,
        "step": 45,
        "min": 0,
        "max": 359,
        "optFunc": function(lcd){
          lcd.clear().cursor(0,0).print(this.name + ":" + this.val);
          lcd.cursor(1,0).print("0 to 359")
        }
      },
      {
        "name": "Back",
        "type": "back",
        "subFunc": function(lcd){
          parent[parent.length - 1] = 0
          cur = mainMenu;
          menuHight = "top"
          menuScroll("",lcd,cur);
          return false
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
  if(reset){
    mode = "menu"
    menuHight="top"
    cur = mainMenu
    cur[cur.length-1] = 0
    menuScroll("",lcd,cur)
  }
  if(!cur){
    cur = mainMenu
    menuScroll("",lcd,cur)
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
      console.log("Going into menu "+ cur[lineNumber].name);
      if(subMenu[lineNumber]){
        cur = subMenu[lineNumber];
        menuScroll("",lcd,cur);
        menuHight = "sub"
      }
    }
//〚 ______________________ SUB MENU ______________________ 〛
  }else if(menuHight == "sub"){
    if(button == "A"){
      menuScroll("up",lcd,cur)
    }else if(button == "B"){
      menuScroll("down",lcd,cur)
    }else if(button == "C"){
      parent = cur
      cur = cur[cur[cur.length-1]]
      if (cur.subFunc){
        var more = cur.subFunc(lcd)
      }
      if(more || !cur.subFunc){
       console.log("Going into menu "+ cur.name);
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
      menuScroll("",lcd,cur)
      menuHight = "sub"
    }
  }else if(menuHight == "optList"){
    if(button == "A"){
      list(lcd,cur,"up")
    }else if(button =="B"){
      list(lcd,cur,"down")
    }else if(button == "C"){
      cur = parent
      menuScroll("",lcd,cur)
      menuHight = "sub"
    }
  }
}

function menuScroll(direction, lcd, curMenu){
  if(!lcd || !curMenu){
    console.log("ERROR PARAMETER NOT DECLARED");
    return
  }

  menuLine = curMenu[curMenu.length -1]
  if(direction == "up"){
    menuLine -= 1
  }else if(direction == "down"){
    menuLine += 1
  }

  function insideArray(item) {
    if(item < 0){
      return curMenu.length - 2
    }else if(item > curMenu.length - 2){
      return 0
    }else{
      return item
    }
  }

  menuLine = insideArray(menuLine)
  var menuLine2 = insideArray(menuLine + 1)
  var topLine = curMenu[menuLine],
      bottomLine = curMenu[menuLine2]
  curMenu[curMenu.length-1] = menuLine

  lcd.clear();
  lcd.useChar("pointerright")
  if(topLine.options){
    lcd.cursor(0,0).print(":pointerright:"+topLine.name +":"+topLine.options[topLine.val]);
  }else if(topLine.val || topLine.val == 0){
    lcd.cursor(0,0).print(":pointerright:"+topLine.name +":"+topLine.val);
  }else{
    lcd.cursor(0,0).print(":pointerright:"+topLine.name);
  }

  if(bottomLine.options){
    lcd.cursor(1,0).print(" "+bottomLine.name +":"+bottomLine.options[bottomLine.val]);
  }else if(bottomLine.val || bottomLine.val == 0){
    lcd.cursor(1,0).print(" "+bottomLine.name + ":" + bottomLine.val)
  }else{
    lcd.cursor(1,0).print(" "+bottomLine.name)
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
