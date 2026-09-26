-- test people, shaped like the live database
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','owner@metrol.in'),
 ('00000000-0000-0000-0000-00000000000b','metrolhr@gmail.com'),
 ('00000000-0000-0000-0000-00000000000c','cmlead@metrol.in'),
 ('00000000-0000-0000-0000-00000000000d','smm1@metrol.in'),
 ('00000000-0000-0000-0000-00000000000e','smm2@metrol.in'),
 ('00000000-0000-0000-0000-00000000000f','editor@metrol.in'),
 ('00000000-0000-0000-0000-000000000010','saleslead@metrol.in'),
 ('00000000-0000-0000-0000-000000000011','sales@metrol.in');
update public.profiles set role='owner', name='Adarsh' where email='owner@metrol.in';
update public.profiles set department_id=(select id from departments where name='Human Resources'), name='HR Person' where email='metrolhr@gmail.com';
update public.profiles set department_id=(select id from departments where name='Content and Marketing'), is_team_lead=true, name='CM Lead' where email='cmlead@metrol.in';
update public.profiles set department_id=(select id from departments where name='Content and Marketing'), name='Deepanshu' where email='smm1@metrol.in';
update public.profiles set department_id=(select id from departments where name='Content and Marketing'), name='Samiksha' where email='smm2@metrol.in';
update public.profiles set department_id=(select id from departments where name='Video Editors'), name='Lokesh' where email='editor@metrol.in';
update public.profiles set department_id=(select id from departments where name='Sales'), is_team_lead=true, name='Sales Lead' where email='saleslead@metrol.in';
update public.profiles set name='Sales Rep' where email='sales@metrol.in';
-- employees: NOT for the HR person (the risky real-world case)
insert into employees (profile_id, full_name, department_id, date_of_joining) select id, name, department_id, '2025-01-01' from profiles where email in ('owner@metrol.in','cmlead@metrol.in','smm1@metrol.in','smm2@metrol.in','editor@metrol.in','saleslead@metrol.in','sales@metrol.in');
-- clients and pages
insert into clients (id, name) values ('c0000000-0000-0000-0000-000000000001','Subhash Goyal'), ('c0000000-0000-0000-0000-000000000002','Lavbhushan');
insert into pages (id, client_id, page_type, instagram_handle, label) values
 ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','main','@subhashgoyal', 'Main'),
 ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','fan','https://www.instagram.com/healingrahasya/?igsh=x', 'Healing Rahasya'),
 ('d0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000001','fan','herbal.life', 'Herbal Life'),
 ('d0000000-0000-0000-0000-000000000004','c0000000-0000-0000-0000-000000000002','fan', null, 'LB fan');
insert into page_assignments (page_id, employee_id) select 'd0000000-0000-0000-0000-000000000002', id from employees where full_name='Deepanshu';
insert into page_assignments (page_id, employee_id) select 'd0000000-0000-0000-0000-000000000003', id from employees where full_name='Samiksha';
