SDR LEAD Rotation sheet final product::
Mission::
Overtime Track Lead assignment and determine the order of 2 independent rotations to figure out what sales rep to give the next lead to based on restrictions::

The Structure::
1. Auth:: this is a program that you sign into and have complete freedom similar to google sheets, Sign up with an email and check email inbox for Authentication check::

2. Calendar:: this is the place where you visually be able to track who you have assigned specific leads to Changes to the database update in real time from our database and every users page will be updated as soon as an applicable action is taken, This Calendar is meant to be visually dynamic in the sense that you can really change the view, scale, and over all visual appeal of it.::

3. Manage Reps:: this is the place where you can add, edit, and delete any Sales reps that appear in the program, You can set and update the original order here by clicking and dragging, these factors effect the current order calculations in real time::

5. Rotations:: this is the intellectual center piece of the program, this is designed to be a complete way to track your assignment of leads to sales reps over time; A Consistent easy and intuitive way to figure out who is next up for the next lead based on the original order and Entries both of which can be updated which is an action that will effect the current rotation in real time; There are two rotations that operate independently of one another "Sub 1k Units" and "1k Units +" and both rotations every type of the 3 orders::

6. Original Order:: this is the Sales Rep order starting order of the rotations and is what your Current Order is Based off of, this is a variable order and can be changed at any time and will change the algorithm logic if changed, you can add or delete as many sales reps which will reorder the rest of the sales rep::

5. Parameters:: this means Max Unit caps, Property Types, And If they are 1k+ Capable putting them the sales rep into both the sub 1k unit rotation and 1K unit +, this determines much of the filtering in the program::

6. Entries Leads & Hits:: this is the what determines the current order compared to the original order, Entries are what create hits and hits are what cause the current order to stray from the original order, Entries allow us to log our leads into the calendar which register hits which changes the rotation in turn helping us keep track of who should be next for the next lead, these hits move back a sales rep one full rotation cycle and bumps everyone up to fill the slot they left behind, this Entries appear on the calendar to be seen visually where they have gone and who they have gone to over time, Entries are sent to our database and can be deleted, view, created, and updated by any user Signed in, they also can be marked for replacement view update, unmarked for replacement view update on marked lead, marked as replacing a lead update and add normal lead, or un marked as replacing a lead and create new lead update on lead replacing other lead (see Add and Edit modals for more details)::

7. Current Order:: this is the Sales Rep order in that is current based on the Entries in the Calendar. It is based off of the hit count of each rep and the original order the least amount of hits and the original order to determine who will be up next for a normal lead. This Current Rotation Order is going to be the most changed Order and needs to function extremely consistently and reliably as it is used for decision making. This is what is displayed in the rotation panel and should be updated immediately after each entry is added, and changed in Sales Rep count and original order::

8. Replacement Order:: this is when a Lead went should not have been given to a sales rep in the first place because they were not qualified properly, when a lead is replaced it starts a new order for sales reps with replacements to their name, This order takes priority over the current order and original order but does not take priority over parameters when it comes to who is up next, The first person in the order is the person whose lead was marked as need for replacement first according the actions time stamp, If the have 2 the same sales rep has two leads that are mark in need of replacement at the same time then they do appear 2 times in the replacement order with the lead that was marked in need of replacement first showing up above where ever the more recently marked one is on the list in comparison to the time stamps of other sales reps with leads marked as in need of replacement, there a two ways to get rid of a lead in need of a replacement on way is to just delete the lead removing it entirely from the data base, the other way is to replace the lead with another lead which is done through a toggle on the ADD/Update modals, Leads should be able to be marked as in need of replacement through the Editing a normal lead, on the Calendar leads that where replaced and lead that are replacing both show up with subtext letting the user know which is which::

9. Rotation Panel:: this is the visual center piece of the program, showing the current order for both rotations in an expandable view and collapsible view. The collapsible view will show each sales rep once with the place in line as they appear next in the current order next to their name allowing for an at a glace view of where everyone is at in the rotation. The expandable view will show the current rotation as it is in a list where sales reps will show up multiple times and only stopping once the original order if sales reps is listed in sequence indicating that at this point the current order would match the original order. There are 4 panels One for the sub 1k rotation, one for the 
1k+ rotation panel reflecting the current order in both an expandable and collapsible view, and one for Replacement Order for 1k+ leads, and One for Replacement Order for sub 1k leads, The Replacement orders panels only appear above their panel if their is at least one sales rep that has a lead marked as replacement and it has not been replaced yet. 1k+ Rotation Order panel and sub 1k rotation order panels should appear when applicable above the current rotation panel for their rotation type, it shows a list of each sales rep that has a lead marked as in need of replacement and if one sales rep has multiple leads marked as in need of replacement they will appear on the list in order of the oldest timestamp for the mark of a lead to the newest::

10. Skips & locally stored - The view settings for the calendar, the skip entry types allow users to test how adding an entry would affect the current rotation order with out updating the data base, This is designed to store calculations such as the algorithm in the front end but since the database has all the same entries other than skips and Next the rotation panel should be the same on everyone's device given no locally stored entry types are input on your system

11. Out of Office:: this is what the OOO tag is referring to when a Sale Rep is listed as out of office for that day and their position as of the time you saved you saved them and for the rest of that particular day they are removed from the Panel until the next day bumping up everyone in the positions below one of their names listed are bumped up for that day. When they come back the next day they are reinserted into the panel bumping everyone back down to where they would have been if the Sales rep when out of office. If everyone is out of Office for that day just have the Rotation panel say We are closed. On the Calendar it just marks them in that days cell under their name as OOO, This should reflect in just the Current Order Panels. OOO tags apply to both Sub1k and 1k+ rotations so if you enter it in one sales reps cell it shows up in the others and same with the rotation panels, These when the modal will change to just ask what time they were going to be out of office and have a time input and a save on the right and cancel on the right. This will update for everyone upon hitting the save button, refreshing the other user's that are signed in page and must be stored in the database with the time that was input and save timestamped. The next day the panels go right back to the way they were.





::Phase 1 The Algorithm::
Example of how I want to produce the rotation and how my code should be behaving according to my examples, Now Remember these are for time frame of the all time toggle::
The most important aspect of this program is ensuring the integrity of the order given different actions over time under high volume. The Rotation needs to remain logically, visually, and functionally reliable given heavy use over time:: This is Priority number one of this program is making sure the Current and Replacement order stay functionally in tact given all CRUD (Create, Read, Update, Delete) database operations::


Key::
R[#] = Full rotation cycle count starting at 1, 
NL = Normal Leads, = + 1 hit
MFR = Marked for replacement leads, = -1 hit 
LTR = Leads that have been replaced (usually accompanied by) = 0 hits
-> = connection of the LTR and the LRL = designates what lead is replacing what
LRL = Leads replacing replacement leads = +1 hit
NA = Nothing is in the sales reps column, = 0 hits
:: = Next Line
:m/d/0z = this is month/day/time of day, 1/1/1pm for January 1st at 1 pm, I will be using this format for time stamps in the program in general but specifically in these algorithm with the NRL::

::We have these sales reps A, B, C, D, E and they can be changed, deleted, reordered and more can be added::



::Instance::
Original Order (Sub 1k)::
1.A, 2.B, 3.C, 4.D, 5.E,::

Original Order (1k+, Sales Rep B, C, and E are 1k capable)::
1.E, 2.B, 3.C

Entries on Calendar (Sub 1k)::
A. 2NL + 1MFR:09/11/1pm -> 1LRL = 3 hits
B. 1NL + 1MFR:09/27/12pm = 1 hit
C. NA = 0 hits
D. 1NL + 1MFR:9/27/6pm + 1MFR:9/26/6am = 1 hit
E. 3NL = 3 hits

Entries on Calendar (1k+)::
E. 1NL
B. 2N + 1MFR:9/5/3pm + 1MFR:9/18/3am -> 1LRL
C. 1MFR:9/27/4am

Meaning Sub 1k::
Sales Rep A has two Normal Leads (NL), and one lead that was Marked Needs Replacement (MFR) lead at 1:00pm on September 11th (:9/11/1pm), and has been replaced (->), by one Lead that Replaces Leads (LRL)::
Sales Rep B has one Normal Lead (NL), and one lead that was Marked Needs Replacement (MFR) lead at 12:pm on September 27th (:9/27/12pm)::
Sales Rep C has Nothing::
Sales Rep D has one Normal Lead (NL), and one lead that was Marked Needs Replacement (MFR) lead at 6pm on September 27th (:9/27/6pm), and one lead that was Marked Needs Replacement (MFR) lead at 6am on September 26th (:09/26/6am)::
Sales Rep E has three Normal Leads (NL)::

Meaning 1k +::
Sales Rep E has one Normal Lead (NL)::
Sales Rep B has two Normal Leads (NL), and one lead that was Marked Needs Replacement (MFR) lead at 3:pm on September 5th (:9/5/3pm), and one lead that was Marked Needs Replacement (MFR) lead at 3:pm on September 18th (:9/18/3am) and has been replaced (->), by one Lead that Replaces Leads (LRL)::
Sales Rep C has one lead that was Marked Needs Replacement (MFR) lead at 4:00am on September 27th::

::What The Results Should Be Displayed in the rotation panel::
The following is the order that the rotation panel should be displayed in order based off of the Instance::

::Replacement Order Panel Result Sub 1k::
1. D
2. B
3. D

::Current Order Panel Result Sub 1k::
Collapsed View Sub 1k::
1.C
2.B
4.D
8.A
12.E

Expanded view Sub 1k::
1.C
2.B
3.C
4.D
5.B
6.C
7.D
8.A
9.B
10.C
11.D
12.E

Original Order Panel Sub 1k Result::
This only shows up in the expanded view below the last entry in the Current Order::
1.A
2.B
3.C
4.D
5.E

Entries on Calendar (1k+)::
E. 1NL
B. 2N + 1MFR:9/5/3pm + 1MFR:9/18/3am -> 1LRL
C. 1MFR:9/27/4am


Replacement Order 1k+::
1.B
2.C

Current Order Panel Result 1k+::
Collapsed view::
1.C
2.E
5.B

Expanded view::
1.C
2.E
3.C
4.E
5.B

Original Order Panel 1k+ Result::
This only shows up in the expanded view below the last entry in the Current Order::
1.D
2.E
3.C














Phase 2: Entry Add and Edit Modals::
This is a General Over view of what we are tyring to Accomplish in Phase 1::
I want to add in the lead entry modal the ability to choose date and their be a date select that is defaulted to today from the button at the top and the default is what ever day you clicked on when clicking from the calendar. This should get passed to the data base and to the calendar grid on everyone's computer who using the program like google sheets. The assign to of course always defaults to what ever sales reps column the cell is under if clicked by calendar and it is who ever is next based on the amount of units, parameters, and who is next in either rotation. In the drop down it should show the rotation for either 1k+ or sub 1k in order with their first position in line from that collapsed view of the rotation panels and depending on the amount of units entered but by default when nothings entered for units it should be the sub 1k. Completely get rid of the Next in rotation blue thing in between the "replace lead" toggle button it wastes space and is redundant because of the drop down for the sales rep. For the Date picker It should Just say Date: Today at default and then when you click the Words today calendar date picker shows up and you can either type date in m/d/yyyy with the /,s already prefilled so you can just type it.  The Replace lead toggle drop down should also get a make over where it will show the leads that the were marked as in need for replacement first at the top of the drop down and the most at the bottom. Show the short date of when it was marked as in need of replacement to the right of the account number. the URL box will stay the same but it will say "Put LSManager Prospect account URL here" instead of https://... Property types should remain the same but become a drop down within this modal where if you click on the property types title the options will appear. And while we still want to store the property types selected in the database they are more for filtering for sales people who are allow to take those leads. Make sure when the options are clicked which will be MFH, MF ,SFH, Commercial the assign sales rep field will be populating the drop down with only people who meet those parameters in order of how they show up in the rotation. Many of this logic is still in place but needs tweaking, some is just fine as it is, But the logic is mostly their its just a bit of UI stuff. Additionally I want you to an X that sticks to the top right of the model for an easy way to cancel out of the modal from the top.::

What We Need to do:
We will need to Make an EditLeadModal.tsx apart form editing the existing LeadModal.tsx and some other accompanying files that I will have in the project files. Much of theses things are already implemented or just need tweaked and we will have to create files and from scratch. Take inspiration from other files while maintaining functionality of every thing around these features. All of this needs to work with our database in supabase and we may need to edit that a little bit as well although I am tryin to avoid it as much as possible but we still can do it if we need and the Database in SQL form is in the project files.::

Here are the new Entry modals we need to create to complete be Phase 1::
I want the order of things to go from top being 0 to the bottom being the top of the modal to 10 being the bottom::

Add New Entry (both from calendar and Add lead button):: Update the existing LeadModal.tsx to have these features::
0. Title :"Add New Entry" their should be a little Trash Icon right next to the 'y' just after the title. when clicked a little modal will pop up saying are you sure you want to delete? and have a yes on the left and no on the right. This will be the new way of deleting a Lead.
1. Entry Type: drop down where you select if you are adding a LEAD, Skip, OOO, Or Next Indicator
2. Replacement  Toggle
3. Unit Count,
4. Property Types drop down (this needs to be switched to an optional thing),
5. Assign Sales rep (should have been real time updating based on parameters if its from the Add Lead button at the top. If it comes from The calendar it should still filter but the person that you clicked on will be the person in the field as long as the parameters fit),
6. URL,
7. Account number(allow this to be text if the text exceeds the max length of the box then just wrap the text),
8. Date Picker
9. Comments
10. Cancel on the Left side and Save on the right side of the modal,



Edit modal for a normal lead:: create this in EditModel.tsx::
0. Title: "Edit Lead [insert Account Number] for [Insert Sales Rep]" their should be a little Trash Icon right next to the 'd' just after the title. when clicked a little modal will pop up saying are you sure you want to delete? and have a yes on the left and no on the right. This will be the new way of deleting a Lead.
1. Entry Type: LEAD is displayed as the selection ad the drop down is not editable and lock and slightly greyed out
2. If a lead is Not marked for Replacement the Replace Lead toggle will be there as normal, there will also be a toggle to mark lead as in need for replacement, meaning you can transition normal leads to replace others if you forgot to mark it when you created.  
3. Unit Count (remembers unit count and is the value by default)
4. Property Types (drop down Remembers your selections)
5. Assign Sales Rep (the drop  down should not update in real time like adding a lead just stick with the Sales Rep this was created for unless changed. If Changed it should move to the Calendar cell based on what sale rep you chose and the date picker later on in the modal)
6. URL (what ever is saved as the URL for the lead that you are editing should appear here by default)
7. Account number (what ever is saved as the Account number for the lead that you are editing should appear here by default)
8. Date Picker
9. Comments (remembers what comments where in there and is displayed through a drop down from the title Comments the text displays the contents of the comment, The date the comment was created and What user's user name the comment was created by.
10. Cancel on the Left Side and Update on the right side.




Edit modal for when editing a lead marked for replacement:: create this in EditModel.tsx
0. Title "Edit Lead Marked For Replacement" their should be a little Trash Icon right next to the 't' just after the title. when clicked a little modal will pop up saying are you sure you want to delete? and have a yes on the left and no on the right. This will be the new way of deleting a Lead.
2. if the lead is marked for replacement that toggle should turn into a toggle that when toggled on and hitting save it will unmark the lead as in need of replacement 
3. Unit Count (remembers unit count and is the value by default)
4. Property Types (drop down Remembers your selections)
5. Assign Sales Rep (This should show who it is currently assigned for First as default and Click to See if the person it is on right no is the 2nd person in the drop down, if it is that means the lead this is )
6. URL (what ever is saved as the URL for the replacement lead that you are editing should appear here by default)
7. Account number (what ever is saved as the Account number for the lead that you are editing should appear here by default)
8. Date Picker
9. Comments (remembers what comments where in there and is displayed through a drop down from the title Comments the text displays the contents of the comment, The date the comment was created and What user's user name the comment was created by.
10. Cancel on the Left Side and Update on the right side.


Edit modal for when editing a lead that replaces a lead marked for replacement:: create this in EditModel.tsx
0. Title "Edit Replacement Lead" their should be a little Trash Icon right next to the 'd' just after the title. when clicked a little modal will pop up saying are you sure you want to delete? and have a yes on the left and no on the right. This will be the new way of deleting a Lead.
UnReplace and Add this will unreplacedr the lead it was replacing then create a new lead based on the inputs saved after hitting update
2. Shows an expandable summary the lead it replaces. When collapsed it just shows the Account number of the lead its replacing (this is hyperlinked to the stored Url) the and the Sales Rep, In the expanded view it will have and the date it was created, the date every action it took to get to this point and with the user that did it and what leads its been attached to (we may need to enhance the databse and code)
3. Unit Count (remembers unit count and is the value by default)
4. Property Types (drop down Remembers your selections)
5. Assign Sales Rep (This should show who it is currently assigned for First as default and Click to See if the person it is on right no is the 2nd person in the drop down, if it is that means the lead this is )
6. URL (what ever is saved as the URL for the replacement lead that you are editing should appear here by default)
7. Account number (what ever is saved as the Account number for the lead that you are editing should appear here by default)
8. Date Picker
9. Comments (remembers what comments where in there and is displayed through a drop down from the title Comments the text displays the contents of the comment, The date the comment was created and What user's user name the comment was created by.
10. Cancel on the Left Side and Update on the right side.





