import test from 'node:test';import assert from 'node:assert/strict';import {classifyScienceSubskill,listScienceSubskills} from '../dist/lib/science_subskill_map.mjs';
for(const [kp,expected] of [['science.G4.FORCE.push-pull','concept'],['science.G5.LIGHT.shade-and-shadow','diagram'],['science.G5.WATER.cycle','data_interpretation'],['science.G3.PROC.measure-basic','experiment'],['science.G6.ECOLOGY.food-chain','concept'],['science.G6.EARTH.weather','data_interpretation']])test(`classify ${kp}`,()=>assert.equal(classifyScienceSubskill({knowledge_point:kp}).primary_subskill,expected));
test('list subskills',()=>assert.ok(listScienceSubskills().length>=7));
test('secondary array',()=>assert.ok(Array.isArray(classifyScienceSubskill({knowledge_point:'science.G4.MATTER.state-change'}).secondary_subskills)));
test('default concept',()=>assert.equal(classifyScienceSubskill({knowledge_point:'unknown'}).primary_subskill,'concept'));
