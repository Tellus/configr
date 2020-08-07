import { Configr, Prop } from '../src/';
import 'mocha';
import { assert, expect } from 'chai';

class TestConfig1 {
  @Prop({
    required: true,
  })
  username!: string;

  @Prop({
    required: true,
  })
  password!: string;

  @Prop({
    default: false,
  })
  isAdmin!: boolean;

  constructor(b:boolean) {

  }
}

describe('Configr: TestConfig1', () => {
  it('Should correctly parse a good JSON object', () => {
    const cfgr = new Configr(TestConfig1);

    const baseObject = {
      username: 'testUser',
      password: 'testPassword',
    };

    const testa = cfgr.parseJson(baseObject);

    expect(testa).to.exist;
    expect(testa.password).to.equal(baseObject.password);
    expect(testa.username).to.equal(baseObject.username);
    expect(testa.isAdmin).to.be.false;
  });
});