var utils = require("../../js/utils.js");
var context = {bricks: {}};
var sioAdress = location.hostname+":"+location.port+"/m2m";
utils.initIO( sioAdress );

var parser = new DOMParser();

var app = angular.module("projetIHM",["ngMaterial","angular-toArrayFilter"]);

app.controller( "projetIHMController", function($scope, $http, $filter) {
	var ctrl = this;
	this.context = context;
	$http.get('/getContext').success(function(data){
		ctrl.bricks = data.bricks;
		//console.log(bricks);
		for(var key in ctrl.bricks){
			var url = document.createElement('a');
			url.href = ctrl.bricks[key].iconURL;
			ctrl.bricks[key].iconURL = url.href;
		}

		utils.io.on("brickAppears", function(data){
			console.log("brickAppears :", data);
			ctrl.bricks[data.id] = data;
			$scope.$apply();
		});
		utils.io.on("brickDisappears", function(data){
			console.log("brickDisappears", data);
			delete ctrl.bricks[data.brickId];
			$scope.$apply();
			console.log("Disappear !!");
		});
	});
});

app.directive("player", function(){ return {
	restrict:'E',
	templateUrl:'templatePlayer.html',
	scope:{
		mediaRendererBrick:"=mediaRendererBrick",
		bricks:"=bricks"
	},
	controllerAs:"playerCtrl",
	controller:function($scope, $window, $mdDialog) {
		var ctrl = this;
		this.bricks = $scope.bricks;
		var cbEventName = $scope.mediaRendererBrick.id+"-eventUPnP";
		var object = {brickId: $scope.mediaRendererBrick.id, eventName: "eventUPnP", cbEventName: cbEventName};

		var ecart = 20;
		var active = true;

		this.focus = false;

		function activer(){
			active = true;
			ctrl.play();
		}

		function desactiver(){
			active = false;
			ctrl.pause();
		}

		function handleOrientation(event) {
			if((event.beta >= (180 - ecart) || event.beta <= (-180 + ecart)) && (event.gamma <= ecart && event.gamma >= -ecart)){
				if(active && ctrl.focus == true) desactiver();
			}
			else {
				if(!active && ctrl.focus == true) activer();
			}
		}

		window.addEventListener('deviceorientation', handleOrientation);

		utils.io.emit("subscribeBrick", object);
		utils.io.on(cbEventName, function(eventData){
			if(eventData.data.attribut == "Volume") {
				$scope.$apply(function () {
					ctrl.volume = eventData.data.value;
				});
			}
			if(eventData.data.attribut == "TransportState") {
				$scope.$apply(function () {
					ctrl.etat = eventData.data.value;
					if(eventData.data.value == "PLAYING") {
						ctrl.setInputPause();
					}
					else if(eventData.data.value == "PAUSED_PLAYBACK") {
						ctrl.setInputPlay();
					}
					else if(eventData.data.value == "STOPPED") {
						ctrl.setInputPlay();
					}
				});
			}

			if(eventData.data.attribut == "AVTransportURIMetaData"){
				var doc = parser.parseFromString(eventData.data.value, "text/xml");
				$scope.$apply(function(){
					ctrl.titre = doc.getElementsByTagName("title")[0].innerHTML;
				});
			}
		});

		utils.call($scope.mediaRendererBrick.id, "getMediasStates", [], function(resultat) {
			$scope.$apply(function(){
				var infos = resultat["urn:schemas-upnp-org:service:AVTransport:1"];

				if(infos.AVTransportURIMetaData != ""){
					// Titre du fichier
					var doc = parser.parseFromString(infos.AVTransportURIMetaData, "text/xml");

					ctrl.titre = doc.getElementsByTagName("title")[0].innerHTML;

					// Etat de la lecture
					ctrl.etat = infos.TransportState;
					if(infos.TransportState == "PLAYING") {
						ctrl.setInputPause();
					}
					else if(infos.TransportState == "PAUSED_PLAYBACK") {
						ctrl.setInputPlay();
					}
					else if(infos.TransportState == "STOPPED") {
						ctrl.setInputPlay();
					}
				} else {
					ctrl.setInputPlay();
				}
			});
		});

		this.volume = 0;
		utils.call($scope.mediaRendererBrick.id, "getVolume", [], function(retour) {
			$scope.$apply(function() {
				ctrl.volume = parser.parseFromString(retour, "text/xml").querySelector("CurrentVolume").textContent;
			});
		});

		this.load = function(id, idBrick){
			console.log(idBrick);
			utils.call($scope.mediaRendererBrick.id, "loadMedia", [idBrick, id], function(res){
				console.log(res);
			});
			this.playPause();
		};

		this.playPause = function() {
			if(this.etat == "PAUSED_PLAYBACK" || this.etat == "STOPPED") this.play();
			else if(this.etat == "PLAYING") this.pause();
		};

		this.play = function() {
			this.focus = true;
			utils.call($scope.mediaRendererBrick.id, "Play", []);
		};

		this.pause = function() {
			utils.call($scope.mediaRendererBrick.id, "Pause", []);
		};

		this.stop = function() {
			this.focus = false;
			utils.call($scope.mediaRendererBrick.id, "Stop", []);
		};

		this.setVolume = function() {
			utils.call($scope.mediaRendererBrick.id, "setVolume", [this.volume]);
		};

		this.setInputPlay = function() {
			this.imagePlayPause = "images/play.svg";
			this.labelPlayPause = "Play";
			this.tooltipPlayPause = "Play";
		};

		this.setInputPause = function() {
			this.imagePlayPause = "images/pause.svg";
			this.labelPlayPause = "Pause";
			this.tooltipPlayPause = "Pause";
		};

		this.open = function(event){
			$mdDialog.show({
				controller: dialogController,
				controllerAs: "mc",
				templateUrl: 'templateMediaExplorer.html',
				parent: angular.element(document.body),
				targetEvent: event,
				clickOutsideToClose:true,
				locals: {
					bricks: this.bricks,
					context: this
				}
			}).then(function(answer) {
			}, function() {
				$scope.status = 'You cancelled the dialog.';
			});
		}
	}
}});

function dialogController($scope, $mdDialog, bricks, context) {
	this.bricks = bricks;
	this.breadCrumb = [];

	this.initTab = function(brick){
		if(brick.init != true){
			brick.init = true;
			this.Browse(brick, 0);
		}
	};

	this.Browse = function(brick, id){
		brick.containers = [];
		brick.items = [];
		brick.breadCrumb;

		utils.call(brick.id
			, "Browse"
			, [id]
			, function(str) {
				var doc = parser.parseFromString(str, "text/xml");
				var result = doc.querySelector( "Result");
				if(result) {
					// Parsing du resultat
					var docResult = parser.parseFromString(result.textContent, "text/xml");
					//console.log("Resultat du doc : ", docResult);

					//Récupérer les infos du dossiers sur lequel on a cliqu�
					utils.call(brick.id,
						"getMetaData",
						[id],
						function(str){
							var doc = parser.parseFromString(str, "text/xml");
							var result = doc.querySelector( "Result" );
							if(result) {
								// Parsing du resultat
								var docResult = parser.parseFromString(result.textContent, "text/xml");

								console.log("Resultat du doc Breadcrumbing : ", docResult);
								var title = docResult.getElementsByTagName("title")[0].innerHTML;
								//console.log("title = ", title);
								if(id == 0){
									$scope.$apply(function(){
										brick.breadCrumb = [];
										brick.breadCrumb.push({title: "Accueil", id: id, brick: brick});
									});
								} else {
									$scope.$apply(function(){
										brick.breadCrumb.push({title: " " + title, id: id, brick: brick});
									});
								}
							}});


					for(var i=0 ; i< docResult.getElementsByTagName("container").length ; i++ ){
						var containerXML = docResult.getElementsByTagName("container")[i];

						//console.log(containerXML.getAttribute("id"));
						var containerObject = {title: containerXML.getElementsByTagName("title")[0].innerHTML,
							id: containerXML.getAttribute("id"),
							parentId: containerXML.getAttribute("parentID"),
							brick: brick,
							class: containerXML.getElementsByTagName("class")[0].innerHTML};

						$scope.$apply(function(){
							brick.containers.push(containerObject);
						});
					}
					for(var i=0 ; i< docResult.getElementsByTagName("item").length ; i++ ){
						var itemXML = docResult.getElementsByTagName("item")[i];
						console.log(" itemXML "+ itemXML.getElementsByTagName("title")[0].innerHTML);

						/* pour eviter erreur avec kodi tant qu'on est pas co a internet*/
						if (itemXML.getElementsByTagName("longDescription")[0] == null) {
							var des = "";
						}else{
							var des = itemXML.getElementsByTagName("longDescription")[0].innerHTML;
						}

						if( itemXML.getElementsByTagName("albumArtURI")[0] == null){
							var aff = "";
						}else{
							var url = document.createElement('a');
							url.href = itemXML.getElementsByTagName("albumArtURI")[0].innerHTML;
							var aff = url.href;
						}

						var itemObject = {title: itemXML.getElementsByTagName("title")[0].innerHTML,
							description: des,
							affiche: aff,
							id: itemXML.getAttribute("id"),
							brick: brick,
							class: itemXML.getElementsByTagName("class")[0].innerHTML};
						$scope.$apply(function(){
							brick.items.push(itemObject);
						});
					}
				}
			}
		);
	};

	this.BreadCrumbing = function(id, index, brick){
		brick.breadCrumb = brick.breadCrumb.slice(0, index);
		this.Browse(brick, id);
	};

	this.Init = function(){
		var i=0;
		console.log(this.bricks);
		for(var key in this.bricks){
			if(this.bricks[key].init == null){
				if(this.bricks[key].type.indexOf('BrickUPnP_MediaServer') != -1){
					if(i == 0){
						this.Browse(this.bricks[key], 0);
						this.bricks[key].init = true;
					} else {
						this.bricks[key].init = false;
					}
					i++;
				}
			}

		}
	};

	this.Init();

	$scope.hide = function() {
		$mdDialog.hide(null);
	};

	$scope.open = function(answer) {
		$mdDialog.hide(answer);
	};

	$scope.infosMedia = function(cart, brickId){
		$scope.dialog = $mdDialog.show({
			controller: dialog2Controller,
			controllerAs: "mc",
			templateUrl: 'templateDetails.html',
			parent: angular.element(document.body),
			targetEvent: event,
			locals: {
				cart: cart,
				brickId: brickId
			},
			clickOutsideToClose:true
		}).then(function(answer) {
			if(answer == null){
				context.open();
			} else {
				context.load(answer.id, answer.idBrick);
			}

		}, function() {
			console.log('You cancelled the dialog.');
		});
	};
}

function dialog2Controller($scope, $mdDialog, cart, brickId){
	this.cart = cart;
	this.brickId = brickId;

	$scope.retour = function() {
		$mdDialog.hide(null);
	};

	$scope.play = function(){
		$mdDialog.hide({id: cart.id, idBrick: brickId});
	}
}

app.config(function($mdThemingProvider) {
	$mdThemingProvider.theme('default')
		.primaryPalette('red')
		.accentPalette('orange');
});
