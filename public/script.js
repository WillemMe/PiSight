var socket = io();
  socket.on('lastPic', function(image) {
    $('#lastPic').attr('src', 'data:image/jpg;base64,' + image);
    $('#lastPic').css("display", "block");
    $("#lastPicTxt").addClass("hidden");
  });
  socket.on("timeKey",function(key){
    if(!key){
      console.log("not Triggerd!");
      $('#timelapseTxt').removeClass("hidden");
      $('#timelapseLive').addClass("hidden");
      $('#timelapse').addClass("notLive");
      $('#timelapse').removeClass("live")
    }else{
      console.log("triggerd");
      $('#timelapseTxt').addClass("hidden");
      $('#timelapseLive').removeClass("hidden");
      $('#timelapseLive').attr('src', key);
      $('#timelapse').removeClass("notLive");
      $('#timelapse').addClass("live")
    }
  })
  socket.on("refresh",(value)=>{
    var slidePos = []
    setup("photoSlider","/data/photos","/pictures")
    setup("sliderGif","/data/gif","/gifs")
  })
var curSlide = 0, nextSlide = 1
$(document).ready(function(){
  setup("photoSlider","/data/photos","/pictures")
  setup("sliderGif","/data/gif","/gifs")
  $(".prev").click(() =>{
    sliderScroll("prev","photoSlider")
  });
  $(".next").click(() =>{
    sliderScroll("next","photoSlider")
  });
  $(".prevGif").click(() =>{
    sliderScroll("prev","sliderGif")
  });
  $(".nextGif").click(() =>{
    sliderScroll("next","sliderGif")
  });
  $('.accordion-section-title').click(function(e) {
    var currentAttrValue = $(this).attr('href');
    if($(e.target).is(".active")){
      $(this).removeClass('active');
        $('.accordion ' + currentAttrValue).slideUp(300).removeClass('open');
    }else{
      $(this).addClass('active');
      $('.accordion ' + currentAttrValue).slideDown(300).addClass('open');
    }
  });
  $(document).on('click', 'a', function(event){
    event.preventDefault();

    $('html, body').animate({
        scrollTop: $( $.attr(this, 'href') ).offset().top
    }, 500);
});
});
var slidePos = []
function setup(sliderName,location,get) {
  $("."+sliderName).html("")
  $.get(get,data =>{
    var list = data.list
    var pCount = 0
    list.forEach(item => {
      $("."+sliderName).append("<div class='slide "+sliderName+"slide "+pCount+"'><img src='"+location+"/"+item+"'></div>")
      pCount += 1
    })
    slidePos[slidePos.length] = {
      "name": sliderName,
      "cur": 0,
      "next": 1,
      "count": pCount -1
    }
    $("."+sliderName+"slide.0").show()
  });
}
function sliderScroll(direction,sliderName){
  var slideObj = findObjByAttr(slidePos, "name", sliderName)
  if(direction == "prev"){
    slideObj.next = slideObj.cur - 1
  }else if(direction == "next"){
    slideObj.next = slideObj.cur + 1
  }
  if(slideObj.next > slideObj.count){
    slideObj.next = 0
  }else if(slideObj.next < 0){
    slideObj.next = slideObj.count
  }

  $("."+sliderName+"slide."+slideObj.cur).hide()
  $("."+sliderName+"slide."+slideObj.next).show()
  slideObj.cur = slideObj.next
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
function findObjIndex(array, attr, value) {
  var obj = array.find(x => x[attr] == value);
  if(!obj){
    return false
  }else{
    var index = array.indexOf(obj);
    return index
  }
}
