Phone viewport optimised webapp pot manager for games with friends.
- the ability to start, stop, resume, end, remove sessions. (All players start the session with zero chips)
- the ability to start matches in a session. and pass the phone around the group and have each player choose between checking folding caling or raising depending on the situation. and the ability to choose who gets a share of the pot at the end (all shares are equal). If the pot is not divisibl by the number of winners that some should get 1 extra chip decided by chance (all chip counts should always be a float)
- min raise should be customizable in a config file in yaml format.
- no blinds but the min raise is necessary for not folding preflop. (preflop raise is allowed)
- max bet for a match is considered all in and should be customizable in the config file.
- sessions should be recorded at a data location specified in a sperate location-config file and in a format that is backup able with github. they should not be in the same dir as the project as the project itself will be on a public opensource github repo while the data is private. the main config yaml should be inside the private data folder/dir
- recorded sessions should have a exact history of every match and every betting round inside that match.
- players added in the yaml should be easily selected in the ui to be added to a match.
- data should be instantly saved so a sudden exit from the webapp or shutdown doesn't lead to losing have the betting round's data.
- the ui/ux should be understandable and easy to use no confirmations when betting needed but backtracking (editing) available for everything. Something like deleting a session should require hard typed confirmations similar deleting a repo in github.
- the total pot size and the amount of chips previously bet by the player in the other round of the match should always be visible when asking user input in betting rounds
- the ui should follow material design 3 guidelines with an exception for the color. The color should be pure black amoled background and white text plus deep blue for buttons and stuff like that. There is not much info to display when asking for user input betting rounds so the text should be bold and big and actually use the whole screen. The main background should be pure black and each card/container or whatever above that should be very slightly less dark grey than the pure black baised on how many layers above the black it is. no gradients allowed but very very subtle underglow like shadows to make layers pop out.
- the app should not decide which player bets next. the app should show a list of players as easy to find and click big buttons to chose who bets next untill everyone has put there bet data and then there should be another list of the players who did not fold so the winners can be choosen. The buttons should be sized in a way that between 6 and 9 should fit in the viewport.
- history should be visible in the ui. Session history should show a list of matches as cards with simple short text showing who lost/won how much. Clicking on a match should show the matches history as a list of rounds as cards with simple text saying who bet how much and if they stayed or folded by the of that betting round.
- scrolling should be minimised for the whole app. only a session/matches history can require scrolling.

